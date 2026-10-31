package com.gymos.mobile;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "GymOSRestFeedback",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class GymOSRestFeedbackPlugin extends Plugin {
    private static final int ALARM_REQUEST_CODE = 4110;

    private Vibrator resolveVibrator() {
        Context ctx = getContext();
        if (ctx == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm =
                    (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }

    private boolean isOsVibrationAllowed() {
        Context ctx = getContext();
        if (ctx == null) return false;
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am != null && am.getRingerMode() == AudioManager.RINGER_MODE_SILENT) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NotificationManager nm =
                    (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null
                    && nm.getCurrentInterruptionFilter()
                            == NotificationManager.INTERRUPTION_FILTER_NONE) {
                return false;
            }
        }
        return true;
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        Vibrator vib = resolveVibrator();
        boolean hasVibrator = vib != null && vib.hasVibrator();
        boolean hasAmplitude =
                hasVibrator
                        && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && vib.hasAmplitudeControl();

        String notifPermission = "granted";
        if (Build.VERSION.SDK_INT >= 33) {
            PermissionState state = getPermissionState("notifications");
            if (state == PermissionState.GRANTED) notifPermission = "granted";
            else if (state == PermissionState.DENIED) notifPermission = "denied";
            else notifPermission = "default";
        } else if (getContext() != null
                && !NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            notifPermission = "denied";
        }

        JSObject ret = new JSObject();
        ret.put("vibrationSupported", hasVibrator);
        ret.put("amplitudeSupported", hasAmplitude);
        ret.put("notificationsSupported", true);
        ret.put("notificationPermission", notifPermission);
        call.resolve(ret);
    }

    @PluginMethod
    public void vibrateTick(PluginCall call) {
        int second = call.getInt("second", 1);
        Vibrator vib = resolveVibrator();
        if (vib == null || !vib.hasVibrator() || !isOsVibrationAllowed()) {
            call.resolve();
            return;
        }

        try {
            int clamped = Math.max(1, Math.min(5, second));
            // 5 -> lightest, 1 -> sharpest pre-zero pulse
            int stepIndex = 6 - clamped; // 1..5
            long durationMs = 28L + (stepIndex * 14L);
            int amplitude = Math.min(240, 55 + (stepIndex * 36));

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (vib.hasAmplitudeControl()) {
                    vib.vibrate(VibrationEffect.createOneShot(durationMs, amplitude));
                } else {
                    vib.vibrate(
                            VibrationEffect.createOneShot(
                                    durationMs, VibrationEffect.DEFAULT_AMPLITUDE));
                }
            } else {
                vib.vibrate(durationMs);
            }
        } catch (Exception ignored) {
            // Respect device-specific motor restrictions cleanly
        }
        call.resolve();
    }

    @PluginMethod
    public void vibrateComplete(PluginCall call) {
        Vibrator vib = resolveVibrator();
        if (vib == null || !vib.hasVibrator() || !isOsVibrationAllowed()) {
            call.resolve();
            return;
        }
        try {
            long[] timings = new long[] { 0, 170, 70, 220, 70, 300 };
            int[] amplitudes = new int[] { 0, 215, 0, 240, 0, 255 };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (vib.hasAmplitudeControl()) {
                    vib.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1));
                } else {
                    vib.vibrate(VibrationEffect.createWaveform(timings, -1));
                }
            } else {
                vib.vibrate(timings, -1);
            }
        } catch (Exception ignored) {
            // Respect device-specific motor restrictions cleanly
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelVibration(PluginCall call) {
        Vibrator vib = resolveVibrator();
        if (vib != null) {
            try {
                vib.cancel();
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationsPermCallback");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("permission", "granted");
        call.resolve(ret);
    }

    @PermissionCallback
    private void notificationsPermCallback(PluginCall call) {
        PermissionState state = getPermissionState("notifications");
        JSObject ret = new JSObject();
        ret.put("permission", state == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void scheduleRestNotification(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.resolve();
            return;
        }
        Double endAtMsDouble = call.getDouble("endAtMs");
        if (endAtMsDouble == null) {
            call.resolve();
            return;
        }
        long endAtMs = endAtMsDouble.longValue();
        if (endAtMs <= System.currentTimeMillis() + 300) {
            call.resolve();
            return;
        }

        RestTimerNotificationReceiver.ensureChannel(ctx);
        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.resolve();
            return;
        }

        Intent intent = new Intent(ctx, RestTimerNotificationReceiver.class);
        intent.putExtra("title", call.getString("title", "Rest Complete · GymOS"));
        intent.putExtra(
                "body",
                call.getString(
                        "body", "Your rest period is finished. Ready for your next set!"));
        intent.putExtra("vibrateEnabled", call.getBoolean("vibrateEnabled", true));

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(ctx, ALARM_REQUEST_CODE, intent, flags);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAtMs, pi);
                } else {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAtMs, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAtMs, pi);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, endAtMs, pi);
            }
        } catch (SecurityException ignored) {
            alarmManager.set(AlarmManager.RTC_WAKEUP, endAtMs, pi);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelRestNotification(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(ctx, RestTimerNotificationReceiver.class);
            int flags = PendingIntent.FLAG_NO_CREATE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(ctx, ALARM_REQUEST_CODE, intent, flags);
            if (pi != null && alarmManager != null) {
                alarmManager.cancel(pi);
                pi.cancel();
            }
            NotificationManagerCompat.from(ctx)
                    .cancel(RestTimerNotificationReceiver.NOTIFICATION_ID);
        }
        call.resolve();
    }
}
