CC      := gcc
CFLAGS  := -std=c11 -Wall -Wextra -Wshadow -Wconversion \
           -O2 -g -pthread -D_GNU_SOURCE
LDFLAGS := -pthread

SRCDIR  := engine/src
CLIDIR  := engine/cli
BUILD   := engine/build
TARGET  := $(BUILD)/netsentinel

TEST_PARSER := $(BUILD)/test_parser
TEST_STATS  := $(BUILD)/test_stats
PARSER_SRCS := engine/tests/test_parser.c $(SRCDIR)/parser.c
STATS_SRCS  := engine/tests/test_stats.c $(SRCDIR)/stats.c

ENGINE_SRCS := $(wildcard $(SRCDIR)/*.c)
CLI_SRCS    := $(CLIDIR)/main.c

OBJS     := $(patsubst $(SRCDIR)/%.c,$(BUILD)/%.o,$(ENGINE_SRCS))
CLI_OBJS := $(patsubst $(CLIDIR)/%.c,$(BUILD)/%.o,$(CLI_SRCS))

.PHONY: all clean run test

all: $(TARGET)

$(TARGET): $(OBJS) $(CLI_OBJS) | $(BUILD)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

$(BUILD)/%.o: $(SRCDIR)/%.c | $(BUILD)
	$(CC) $(CFLAGS) -I$(SRCDIR) -c -o $@ $<

$(BUILD)/%.o: $(CLIDIR)/%.c | $(BUILD)
	$(CC) $(CFLAGS) -I$(SRCDIR) -c -o $@ $<

$(TEST_PARSER): $(PARSER_SRCS) | $(BUILD)
	$(CC) $(CFLAGS) -I$(SRCDIR) -o $@ $^

$(TEST_STATS): $(STATS_SRCS) | $(BUILD)
	$(CC) $(CFLAGS) -I$(SRCDIR) -o $@ $^

test: $(TEST_PARSER) $(TEST_STATS)
	./$(TEST_PARSER)
	./$(TEST_STATS)

$(BUILD):
	mkdir -p $(BUILD)

run: $(TARGET)
	sudo $(TARGET)

clean:
	rm -rf $(BUILD)