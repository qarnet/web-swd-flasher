#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zephyr/devicetree.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/random/random.h>

LOG_MODULE_REGISTER(rtt_feedback, LOG_LEVEL_INF);

#define CLI_LINE_LEN 128

static const struct device *const cli_uart = DEVICE_DT_GET(DT_CHOSEN(zephyr_shell_uart));
static bool counter_running = true;
static uint32_t counter = 0;

static void cli_write(const char *text)
{
	for (size_t i = 0; text[i] != '\0'; i++) {
		uart_poll_out(cli_uart, text[i]);
	}
}

static void cli_printf(const char *fmt, ...)
{
	char buf[192];
	va_list args;

	va_start(args, fmt);
	vsnprintf(buf, sizeof(buf), fmt, args);
	va_end(args);

	cli_write(buf);
}

static void cli_prompt(void)
{
	cli_write("> ");
}

static bool parse_int(const char *text, int *value)
{
	char *end = NULL;
	long parsed;

	errno = 0;
	parsed = strtol(text, &end, 10);
	if (errno != 0 || end == text || *end != '\0' || parsed < INT_MIN || parsed > INT_MAX) {
		return false;
	}

	*value = (int)parsed;
	return true;
}

static void cmd_help(void)
{
	cli_write(
		"Commands:\r\n"
		"  help\r\n"
		"  ping\r\n"
		"  counter [on|off]\r\n"
		"  count <start> <end>\r\n"
		"  uptime\r\n"
		"  info\r\n"
		"  delay <ms>\r\n"
		"  rand [min] [max]\r\n"
		"  echo <text>\r\n");
}

static void cmd_ping(void)
{
	cli_write("pong\r\n");
}

static void cmd_counter(char *arg)
{
	if (arg == NULL || *arg == '\0') {
		cli_printf("Counter is %s\r\n", counter_running ? "running" : "stopped");
		return;
	}

	if (strcmp(arg, "on") == 0) {
		counter_running = true;
		cli_write("Counter started\r\n");
	} else if (strcmp(arg, "off") == 0) {
		counter_running = false;
		cli_write("Counter stopped\r\n");
	} else {
		cli_write("Usage: counter [on|off]\r\n");
	}
}

static void cmd_count(char *start_arg, char *end_arg)
{
	int start;
	int end;

	if (start_arg == NULL || end_arg == NULL) {
		cli_write("Usage: count <start> <end>\r\n");
		return;
	}

	if (!parse_int(start_arg, &start) || !parse_int(end_arg, &end)) {
		cli_write("Invalid number\r\n");
		return;
	}

	if (start <= end) {
		for (int i = start; i <= end; i++) {
			cli_printf("%d\r\n", i);
			k_msleep(100);
		}
	} else {
		for (int i = start; i >= end; i--) {
			cli_printf("%d\r\n", i);
			k_msleep(100);
		}
	}
}

static void cmd_uptime(void)
{
	uint32_t uptime = k_uptime_get_32();

	cli_printf("Uptime: %u ms\r\n", uptime);
	cli_printf("Uptime: %u.%03u s\r\n", uptime / 1000, uptime % 1000);
}

static void cmd_info(void)
{
	cli_printf("Board: %s\r\n", CONFIG_BOARD_TARGET);
	cli_printf("Zephyr version: %u\r\n", sys_kernel_version_get());
	cli_printf("Build time: %s %s\r\n", __DATE__, __TIME__);
}

static void cmd_delay(char *ms_arg)
{
	int ms;

	if (ms_arg == NULL) {
		cli_write("Usage: delay <ms>\r\n");
		return;
	}

	if (!parse_int(ms_arg, &ms) || ms < 0) {
		cli_write("Invalid number\r\n");
		return;
	}

	cli_printf("Delaying for %d ms...\r\n", ms);
	k_msleep(ms);
	cli_write("Done\r\n");
}

static void cmd_rand(char *min_arg, char *max_arg)
{
	int min = 0;
	int max = 100;

	if (min_arg != NULL && !parse_int(min_arg, &min)) {
		cli_write("Invalid number\r\n");
		return;
	}

	if (max_arg != NULL && !parse_int(max_arg, &max)) {
		cli_write("Invalid number\r\n");
		return;
	}

	if (max < min) {
		cli_write("Invalid range\r\n");
		return;
	}

	cli_printf("Random [%d-%d]: %d\r\n", min, max,
		   min + (sys_rand32_get() % (uint32_t)(max - min + 1)));
}

static void cmd_echo(char *text)
{
	if (text == NULL || *text == '\0') {
		cli_write("Usage: echo <text>\r\n");
		return;
	}

	cli_printf("%s\r\n", text);
}

static void process_command(char *line)
{
	char *cmd;
	char *args;
	char *arg1 = NULL;
	char *arg2 = NULL;

	while (isspace((unsigned char)*line)) {
		line++;
	}

	if (*line == '\0') {
		return;
	}

	args = strpbrk(line, " \t");
	if (args != NULL) {
		*args++ = '\0';
		while (isspace((unsigned char)*args)) {
			args++;
		}
		if (*args == '\0') {
			args = NULL;
		}
	}

	cmd = line;

	if (args != NULL) {
		arg1 = args;
		arg2 = strpbrk(arg1, " \t");
		if (arg2 != NULL) {
			*arg2++ = '\0';
			while (isspace((unsigned char)*arg2)) {
				arg2++;
			}
			if (*arg2 == '\0') {
				arg2 = NULL;
			}
		}
	}

	if (strcmp(cmd, "help") == 0) {
		cmd_help();
	} else if (strcmp(cmd, "ping") == 0) {
		cmd_ping();
	} else if (strcmp(cmd, "counter") == 0) {
		cmd_counter(arg1);
	} else if (strcmp(cmd, "count") == 0) {
		cmd_count(arg1, arg2);
	} else if (strcmp(cmd, "uptime") == 0) {
		cmd_uptime();
	} else if (strcmp(cmd, "info") == 0) {
		cmd_info();
	} else if (strcmp(cmd, "delay") == 0) {
		cmd_delay(arg1);
	} else if (strcmp(cmd, "rand") == 0) {
		cmd_rand(arg1, arg2);
	} else if (strcmp(cmd, "echo") == 0) {
		cmd_echo(args);
	} else {
		cli_write("Unknown command. Type 'help'.\r\n");
	}
}

int main(void)
{
	char line[CLI_LINE_LEN];
	size_t len = 0;
	int64_t next_tick = k_uptime_get() + 1000;
	uint8_t ch;

	if (!device_is_ready(cli_uart)) {
		LOG_ERR("UART device not ready");
		return 0;
	}

	LOG_INF("RTT feedback firmware started.");
	LOG_INF("Board: %s", CONFIG_BOARD_TARGET);
	LOG_INF("UART CLI ready");

	cli_write("\r\nSimple UART CLI ready. Type 'help'.\r\n");
	cli_prompt();

	while (1) {
		while (uart_poll_in(cli_uart, &ch) == 0) {
			if (ch == '\r' || ch == '\n') {
				cli_write("\r\n");
				line[len] = '\0';
				process_command(line);
				len = 0;
				cli_prompt();
				continue;
			}

			if ((ch == '\b' || ch == 0x7f) && len > 0) {
				len--;
				cli_write("\b \b");
				continue;
			}

			if (isprint(ch) && len < (CLI_LINE_LEN - 1)) {
				line[len++] = (char)ch;
				uart_poll_out(cli_uart, ch);
			}
		}

		if (counter_running && k_uptime_get() >= next_tick) {
			LOG_INF("Tick: %u", counter);
			counter++;
			next_tick += 1000;
		}

		k_msleep(10);
	}

	return 0;
}
