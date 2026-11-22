package com.thacklab.ninjacoach;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps Ninja Coach working while it reviews your games with the screen off:
 * a foreground service (so Android treats the app as busy, with a
 * notification saying so) holding a partial wake lock (so the processor keeps
 * running). The reviewing itself still happens in the web app's engine.
 */
public class ReviewService extends Service {
    static final String CHANNEL = "reviews";
    static final int ID = 7;
    /** At most this long in one go; the web app starts it again for more. */
    private static final long MAX_MS = 6L * 60 * 60 * 1000;
    private PowerManager.WakeLock lock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = intent != null ? intent.getStringExtra("text") : null;
        Notification n = build(this, text);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID, n);
        if (lock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NinjaCoach:review");
                lock.setReferenceCounted(false);
            }
        }
        if (lock != null && !lock.isHeld()) lock.acquire(MAX_MS);
        return START_NOT_STICKY;
    }

    /** Android 15 stops data-sync services after a few hours a day. */
    public void onTimeout(int startId, int fgsType) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        super.onDestroy();
    }

    /** Changes the notification's text while the service runs. */
    static void update(Context c, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ID, build(c, text));
    }

    private static Notification build(Context c, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Game reviews", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Shown while Ninja Coach reviews your games with the screen off");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            b = new Notification.Builder(c, CHANNEL);
        } else {
            b = new Notification.Builder(c);
        }
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, piFlags);
        return b.setContentTitle("Ninja Coach is reviewing your games")
            .setContentText(text == null || text.isEmpty() ? "Working with the screen off" : text)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }
}
