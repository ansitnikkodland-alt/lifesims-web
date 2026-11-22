package app.lifesims.screentime;

import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads Android-owned daily foreground usage totals, never app content or
 * browsing history. Keeps only the seven days specifically requested.
 */
public final class UsageCollector {
    private UsageCollector() {}

    private static String day(Calendar date) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d",
                date.get(Calendar.YEAR), date.get(Calendar.MONTH) + 1,
                date.get(Calendar.DAY_OF_MONTH));
    }

    private static String label(PackageManager pm, String pkg) {
        try {
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            String text = pm.getApplicationLabel(info).toString().trim();
            return text.isEmpty() ? pkg : text;
        } catch (Exception e) {
            // Android 11+ package visibility rules can hide labels. Package
            // identifiers are still available through UsageStatsManager.
            return pkg;
        }
    }

    public static JSONObject collect(Context context, int days) throws Exception {
        if (!MainActivity.hasUsageAccess(context)) throw new SecurityException("Usage access denied");
        if (days < 1 || days > 7) throw new IllegalArgumentException("Invalid days");
        UsageStatsManager manager =
                (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
        if (manager == null) throw new IllegalStateException("UsageStats unavailable");
        PackageManager pm = context.getPackageManager();
        final long now = System.currentTimeMillis();
        Calendar midnight = Calendar.getInstance();
        midnight.set(Calendar.HOUR_OF_DAY, 0);
        midnight.set(Calendar.MINUTE, 0);
        midnight.set(Calendar.SECOND, 0);
        midnight.set(Calendar.MILLISECOND, 0);
        midnight.add(Calendar.DAY_OF_YEAR, 1 - days);
        JSONArray rows = new JSONArray();
        Map<String, String> names = new HashMap<>();
        for (int day = 0; day < days; day++) {
            Calendar next = (Calendar) midnight.clone();
            next.add(Calendar.DAY_OF_YEAR, 1);
            final long start = midnight.getTimeInMillis();
            final long end = Math.min(next.getTimeInMillis(), now);
            if (end <= start) {
                midnight = next;
                continue;
            }
            List<UsageStats> stats = manager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY, start, end);
            Map<String, Long> totals = new HashMap<>();
            if (stats != null) {
                for (UsageStats stat : stats) {
                    if (stat == null || stat.getPackageName() == null) continue;
                    String pkg = stat.getPackageName();
                    if (pkg.equals(context.getPackageName())) continue;
                    long duration = stat.getTotalTimeInForeground();
                    if (duration < 1000) continue;
                    // Daily UsageStats buckets can be approximate; never
                    // convert them into fabricated start/end session times.
                    totals.put(pkg, Math.min(86400000L,
                            totals.getOrDefault(pkg, 0L) + duration));
                }
            }
            String date = day(midnight);
            for (Map.Entry<String, Long> entry : totals.entrySet()) {
                String pkg = entry.getKey();
                int seconds = (int) Math.min(86400L,
                        Math.round(entry.getValue() / 1000.0));
                if (seconds <= 0) continue;
                JSONObject row = new JSONObject();
                row.put("date", date);
                row.put("app", names.computeIfAbsent(pkg, p -> label(pm, p)));
                row.put("packageName", pkg);
                row.put("seconds", seconds);
                rows.put(row);
                if (rows.length() > 5000) throw new IllegalStateException("Too many usage entries");
            }
            midnight = next;
        }
        JSONObject payload = new JSONObject();
        payload.put("version", 1);
        payload.put("source", "android");
        payload.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        payload.put("records", rows);
        payload.put("generatedAt", now);
        payload.put("detail", "daily Android foreground usage totals, not individual sessions");
        return payload;
    }
}
