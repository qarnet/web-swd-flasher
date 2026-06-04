#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdarg.h>
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
#include <zephyr/sys/ring_buffer.h>
#include <zephyr/sys/util.h>

LOG_MODULE_REGISTER(rtt_feedback, LOG_LEVEL_INF);

#define CLI_LINE_LEN 128
#define CLI_ARG_MAX 8
#define CLI_RX_BUF_SIZE 256

static const struct device *const cli_uart = DEVICE_DT_GET(DT_CHOSEN(zephyr_shell_uart));

RING_BUF_DECLARE(cli_rx_ringbuf, CLI_RX_BUF_SIZE);

static bool counter_running = true;
static uint32_t counter_value;
static uint32_t rx_byte_count;

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

static bool parse_long(const char *text, long *value)
{
	char *end = NULL;
	long parsed;

	errno = 0;
	parsed = strtol(text, &end, 10);
	if (errno != 0 || end == text || *end != '\0') {
		return false;
	}

	*value = parsed;
	return true;
}

static size_t split_args(char *line, char **argv, size_t max_args)
{
	size_t argc = 0;
	char *p = line;

	while (*p != '\0' && argc < max_args) {
		while (isspace((unsigned char)*p)) {
			p++;
		}

		if (*p == '\0') {
			break;
		}

		if (*p == '"') {
			p++;
			argv[argc++] = p;
			while (*p != '\0' && *p != '"') {
				p++;
			}
			if (*p == '"') {
				*p++ = '\0';
			}
		} else {
			argv[argc++] = p;
			while (*p != '\0' && !isspace((unsigned char)*p)) {
				p++;
			}
			if (*p != '\0') {
				*p++ = '\0';
			}
		}
	}

	return argc;
}

static void cmd_help(void)
{
	cli_write(
		"Commands:\r\n"
		"  help\r\n"
		"  ping\r\n"
		"  echo <text>\r\n"
		"  count <start> <end>\r\n"
		"  counter [on|off]\r\n"
		"  uptime\r\n"
		"  info\r\n"
		"  delay <ms>\r\n"
		"  rand [min] [max]\r\n");
}

static void cmd_ping(void)
{
	cli_write("pong\r\n");
}

static void cmd_echo(size_t argc, char **argv)
{
	if (argc < 2U) {
		cli_write("Usage: echo <text>\r\n");
		return;
	}

	for (size_t i = 1; i < argc; i++) {
		cli_write(argv[i]);
		if (i + 1U < argc) {
			cli_write(" ");
		}
	}
	cli_write("\r\n");
}

static void cmd_count(size_t argc, char **argv)
{
	long start;
	long end;

	if (argc != 3U) {
		cli_write("Usage: count <start> <end>\r\n");
		return;
	}

	if (!parse_long(argv[1], &start) || !parse_long(argv[2], &end)) {
		cli_write("Invalid number\r\n");
		return;
	}

	if (start <= end) {
		for (long i = start; i <= end; i++) {
			cli_printf("%ld\r\n", i);
			k_msleep(100);
		}
	} else {
		for (long i = start; i >= end; i--) {
			cli_printf("%ld\r\n", i);
			k_msleep(100);
		}
	}
}

static void cmd_counter(size_t argc, char **argv)
{
	if (argc == 1U) {
		cli_printf("Counter %s, value %u\r\n",
			counter_running ? "running" : "stopped", counter_value);
		return;
	}

	if (argc != 2U) {
		cli_write("Usage: counter [on|off]\r\n");
		return;
	}

	if (strcmp(argv[1], "on") == 0) {
		counter_running = true;
		cli_write("Counter started\r\n");
		return;
	}

	if (strcmp(argv[1], "off") == 0) {
		counter_running = false;
		cli_write("Counter stopped\r\n");
		return;
	}

	cli_write("Usage: counter [on|off]\r\n");
}

static void cmd_uptime(void)
{
	uint32_t uptime = k_uptime_get_32();

	cli_printf("Uptime: %u ms\r\n", uptime);
	cli_printf("Uptime: %u.%03u s\r\n", uptime / 1000U, uptime % 1000U);
}

static void cmd_info(void)
{
	cli_printf("Board: %s\r\n", CONFIG_BOARD_TARGET);
	cli_printf("Build time: %s %s\r\n", __DATE__, __TIME__);
}

static void cmd_delay(size_t argc, char **argv)
{
	long ms;

	if (argc != 2U) {
		cli_write("Usage: delay <ms>\r\n");
		return;
	}

	if (!parse_long(argv[1], &ms) || ms < 0) {
		cli_write("Invalid number\r\n");
		return;
	}

	cli_printf("Delaying for %ld ms...\r\n", ms);
	k_msleep((uint32_t)ms);
	cli_write("Done\r\n");
}

static void cmd_rand(size_t argc, char **argv)
{
	long min = 0;
	long max = 100;

	if (argc >= 2U && !parse_long(argv[1], &min)) {
		cli_write("Invalid min\r\n");
		return;
	}

	if (argc >= 3U && !parse_long(argv[2], &max)) {
		cli_write("Invalid max\r\n");
		return;
	}

	if (max < min) {
		cli_write("Invalid range\r\n");
		return;
	}

	cli_printf("Random [%ld-%ld]: %ld\r\n", min, max,
		min + (long)(sys_rand32_get() % (uint32_t)(max - min + 1L)));
}

static void process_command(char *line)
{
	char *argv[CLI_ARG_MAX];
	size_t argc;

	argc = split_args(line, argv, ARRAY_SIZE(argv));
	if (argc == 0U) {
		return;
	}

	if (strcmp(argv[0], "help") == 0) {
		cmd_help();
	} else if (strcmp(argv[0], "ping") == 0) {
		cmd_ping();
	} else if (strcmp(argv[0], "echo") == 0) {
		cmd_echo(argc, argv);
	} else if (strcmp(argv[0], "count") == 0) {
		cmd_count(argc, argv);
	} else if (strcmp(argv[0], "counter") == 0) {
		cmd_counter(argc, argv);
	} else if (strcmp(argv[0], "uptime") == 0) {
		cmd_uptime();
	} else if (strcmp(argv[0], "info") == 0) {
		cmd_info();
	} else if (strcmp(argv[0], "delay") == 0) {
		cmd_delay(argc, argv);
	} else if (strcmp(argv[0], "rand") == 0) {
		cmd_rand(argc, argv);
	} else {
		cli_write("Unknown command. Type 'help'.\r\n");
	}
}

static void cli_uart_isr(const struct device *dev, void *user_data)
{
	uint8_t buf[32];
	int rx;

	ARG_UNUSED(user_data);

	if (!uart_irq_update(dev)) {
		return;
	}

	while (uart_irq_rx_ready(dev)) {
		rx = uart_fifo_read(dev, buf, sizeof(buf));
		if (rx <= 0) {
			break;
		}

		(void)ring_buf_put(&cli_rx_ringbuf, buf, (uint32_t)rx);
		rx_byte_count += (uint32_t)rx;
	}
}

static void process_rx_bytes(void)
{
	static char line[CLI_LINE_LEN];
	static size_t len;
	uint8_t ch;

	while (ring_buf_get(&cli_rx_ringbuf, &ch, 1U) == 1U) {
		if (ch == '\r' || ch == '\n') {
			cli_write("\r\n");
			line[len] = '\0';
			process_command(line);
			len = 0;
			cli_prompt();
			continue;
		}

		if ((ch == '\b' || ch == 0x7fU) && len > 0U) {
			len--;
			cli_write("\b \b");
			continue;
		}

		if (isprint(ch) && len < (CLI_LINE_LEN - 1U)) {
			line[len++] = (char)ch;
			uart_poll_out(cli_uart, ch);
		}
	}
}

int main(void)
{
	int64_t next_tick = k_uptime_get() + 1000;

	if (!device_is_ready(cli_uart)) {
		LOG_ERR("UART device not ready");
		return 0;
	}

	uart_irq_callback_user_data_set(cli_uart, cli_uart_isr, NULL);
	uart_irq_rx_enable(cli_uart);

	LOG_INF("RTT feedback firmware started.");
	LOG_INF("Board: %s", CONFIG_BOARD_TARGET);
	cli_write("\r\nSimple UART CLI ready. Type 'help'.\r\n");
	cli_prompt();

	while (1) {
		process_rx_bytes();

		if (counter_running && k_uptime_get() >= next_tick) {
			LOG_INF("Tick: %u rx:%u", counter_value, rx_byte_count);
			counter_value++;
			next_tick += 1000;
		}

		k_msleep(1);
	}

	return 0;
}
