// Test-only helper, compiled by the macOS runner outside the installed bundle.
#include <errno.h>
#include <inttypes.h>
#include <limits.h>
#include <libproc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>

static int failure(const char *stage, int code) {
    printf("{\"status\":\"unavailable\",\"stage\":\"%s\",\"errno\":%d}\n", stage, code);
    return 1;
}

static void json_string(const char *value) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)value; *p; ++p) {
        if (*p == '"' || *p == '\\') printf("\\%c", *p);
        else if (*p < 0x20) printf("\\u%04x", (unsigned int)*p);
        else putchar(*p);
    }
    putchar('"');
}

int main(int argc, char **argv) {
    if (argc != 2) return failure("argument-count", EINVAL);
    char *end = NULL;
    errno = 0;
    const long parsed = strtol(argv[1], &end, 10);
    if (errno || end == argv[1] || *end || parsed <= 0 || parsed > INT_MAX)
        return failure("pid", EINVAL);
    const int pid = (int)parsed;
    struct proc_bsdinfo before = {0}, after = {0};
    char executable[PROC_PIDPATHINFO_MAXSIZE] = {0};
    char repeated[PROC_PIDPATHINFO_MAXSIZE] = {0};
    errno = 0;
    const int first = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &before, sizeof(before));
    const int first_errno = errno;
    if (first != (int)sizeof(before)) return failure("bsd-before", first_errno);
    errno = 0;
    const int length = proc_pidpath(pid, executable, sizeof(executable));
    const int path_errno = errno;
    if (length <= 0) return failure("path", path_errno);
    if ((size_t)length >= sizeof(executable) || executable[0] != '/' ||
        strnlen(executable, sizeof(executable)) != (size_t)length)
        return failure("path-shape", EINVAL);
    errno = 0;
    const int repeated_length = proc_pidpath(pid, repeated, sizeof(repeated));
    const int repeated_errno = errno;
    if (repeated_length <= 0) return failure("path-repeat", repeated_errno);
    if (repeated_length != length || strcmp(executable, repeated))
        return failure("path-changed", EAGAIN);
    errno = 0;
    const int last = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &after, sizeof(after));
    const int last_errno = errno;
    if (last != (int)sizeof(after)) return failure("bsd-after", last_errno);
    if (before.pbi_pid != (uint32_t)pid || after.pbi_pid != before.pbi_pid ||
        after.pbi_ppid != before.pbi_ppid || after.pbi_start_tvsec != before.pbi_start_tvsec ||
        after.pbi_start_tvusec != before.pbi_start_tvusec)
        return failure("identity-changed", EAGAIN);
    printf("{\"status\":\"present\",\"pid\":%" PRIu32 ",\"ppid\":%" PRIu32
           ",\"startSeconds\":%" PRIu64 ",\"startMicroseconds\":%" PRIu64 ",\"exe\":",
           before.pbi_pid, before.pbi_ppid, before.pbi_start_tvsec, before.pbi_start_tvusec);
    json_string(executable);
    puts("}");
    return 0;
}
