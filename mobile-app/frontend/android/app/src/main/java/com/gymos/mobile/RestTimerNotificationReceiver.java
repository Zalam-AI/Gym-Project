package com.gymos.mobile;

import android.Manifest;
import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.List;

public class RestTimerNotificationReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "gymos_rest_timer_channel";
    public static final int NOTIFICATION_ID = 4109;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        // Skip notification if GymOS is already visible in the foreground
        if (isAppInForeground(context)) return;

        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                return;
            }
        }

        ensureChannel(context);

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        boolean vibrateEnabled = intent.getBooleanExtra("vibrateEnabled", true);

        if (title == null || title.isEmpty()) {
            title = "Rest Complete · GymOS";
        }
        if (body == null || body.isEmpty()) {
            body = "Your rest period is finished. Ready for your next set!";
        }

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, launchIntent, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(contentIntent);

        if (!vibrateEnabled) {
            builder.setSilent(true);
        }

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // Respect OS notification permission revocation
        }
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                    (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Workout Rest Timer",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Alerts when your workout rest period finishes.");
                channel.enableVibration(true);
                nm.createNotificationChannel(channel);
            }
        }
    }

    private boolean isAppInForeground(Context context) {
        ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return false;
        List<ActivityManager.RunningAppProcessInfo> procs = am.getRunningAppProcesses();
        if (procs == null) return false;
        String pkg = context.getPackageName();
        for (ActivityManager.RunningAppProcessInfo info : procs) {
            if (info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                    && pkg.equals(info.processName)) {
                return true;
            }
        }
        return false;
    }
}
