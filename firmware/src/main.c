#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(rtt_feedback, LOG_LEVEL_INF);

int main(void)
{
	uint32_t counter = 0;

	printk("RTT feedback firmware started.\n");
	LOG_INF("Board: %s", CONFIG_BOARD_TARGET);

	while (1) {
		printk("[%u] Hello from RTT! Counter: %u\n",
		       k_uptime_get_32(), counter);
		LOG_INF("Tick: %u", counter);

		counter++;
		k_msleep(1000);
	}

	return 0;
}
