package app.lifesims.screentime;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Explicitly user-started local HTTP endpoint. No Wi-Fi bind, no upload and
 * no Accessibility. Foreground notification allows the user to stop it.
 */
public final class UsageBridgeService extends Service {
    private static final String CHANNEL = "lifesims-usage-local";
    private static final String STOP = "lifesims-stop-local-usage";
    private static final String WEB_ORIGIN = "https://ansitnikkodland-alt.github.io";
    private static final int PORT = 18765;
    private static final int NOTIFICATION_ID = 726;
    public static volatile boolean running = false;
    private volatile ServerSocket server;
    private Thread worker;

    private Notification notification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL, "LifeSims · Локальная синхронизация",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Служба доступна только приложению LifeSims в этом телефоне");
            if (manager != null) manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent openIntent = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, UsageBridgeService.class).setAction(STOP);
        PendingIntent stopIntent = PendingIntent.getService(this, 2, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setContentTitle("LifeSims · экранное время")
                .setContentText("Локальная передача на 127.0.0.1 · только по коду")
                .setSmallIcon(android.R.drawable.ic_menu_recent_history)
                .setContentIntent(openIntent)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        "Остановить", stopIntent).build())
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!MainActivity.hasUsageAccess(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification(),
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification());
            }
        } catch (RuntimeException e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (worker == null || !worker.isAlive()) {
            worker = new Thread(this::serve, "LifeSims-local-usage-server");
            worker.start();
        }
        return START_STICKY;
    }

    private void serve() {
        try (ServerSocket listener = new ServerSocket(PORT, 8,
                InetAddress.getByName("127.0.0.1"))) {
            server = listener;
            running = true;
            while (!listener.isClosed() && !Thread.currentThread().isInterrupted()) {
                try (Socket client = listener.accept()) {
                    // Access from another device is impossible: bind loopback only.
                    if (!client.getInetAddress().isLoopbackAddress()) continue;
                    client.setSoTimeout(9000);
                    handle(client);
                } catch (IOException ignored) {
                    if (listener.isClosed()) break;
                } catch (RuntimeException ignored) {
                    // A malformed local request must not kill the whole bridge.
                }
            }
        } catch (IOException ignored) {
            // Port busy, OS shutdown, or service stopped. No remote fallback.
        } finally {
            running = false;
            server = null;
            stopSelf();
        }
    }

    private static boolean allowed(String origin) {
        return WEB_ORIGIN.equals(origin);
    }

    private static boolean matchesKey(String requestKey, String expectedKey) {
        if (requestKey == null || expectedKey == null) return false;
        return MessageDigest.isEqual(requestKey.getBytes(StandardCharsets.UTF_8),
                expectedKey.getBytes(StandardCharsets.UTF_8));
    }

    private void handle(Socket socket) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                socket.getInputStream(), StandardCharsets.UTF_8));
        String first = reader.readLine();
        if (first == null || first.length() > 1024) return;
        Map<String, String> headers = new HashMap<>();
        String line;int chars = 0;
        while ((line = reader.readLine()) != null && !line.isEmpty()) {
            chars += line.length();
            if (chars > 8192) {
                respond(socket, 431, "{\"error\":\"Headers too long\"}", false);
                return;
            }
            int at = line.indexOf(':');
            if (at > 0) headers.put(line.substring(0, at).trim()
                    .toLowerCase(Locale.ROOT), line.substring(at + 1).trim());
        }
        String[] parts = first.split(" ");
        if (parts.length != 3) {respond(socket,400,"{\"error\":\"Bad request\"}",false);return;}
        String method = parts[0], target = parts[1];
        boolean cors = allowed(headers.get("origin"));
        if (!cors) {respond(socket,403,"{\"error\":\"Origin denied\"}",false);return;}
        if (method.equals("OPTIONS")) {
            respond(socket,204,"",true);
            return;
        }
        if (!method.equals("GET")) {respond(socket,405,"{\"error\":\"Method denied\"}",true);return;}
        if (!matchesKey(headers.get("x-lifesims-key"), MainActivity.pairingKey(this))) {
            respond(socket,401,"{\"error\":\"Pairing key invalid\"}",true);
            return;
        }
        if (!MainActivity.hasUsageAccess(this)) {
            respond(socket,403,"{\"error\":\"Usage access denied\"}",true);
            return;
        }
        if (!target.matches("^/v1/usage\\?days=[1-7]$")) {
            respond(socket,404,"{\"error\":\"Unknown endpoint\"}",true);
            return;
        }
        int days = target.charAt(target.length()-1)-'0';
        try {
            JSONObject result = UsageCollector.collect(this, days);
            respond(socket,200,result.toString(),true);
        } catch (SecurityException e) {
            respond(socket,403,"{\"error\":\"Usage access denied\"}",true);
        } catch (Exception e) {
            respond(socket,503,"{\"error\":\"Usage data unavailable\"}",true);
        }
    }

    private void respond(Socket socket, int status, String data, boolean cors) throws IOException {
        String message;
        switch (status) {
            case 200: message="OK"; break;
            case 204: message="No Content"; break;
            case 400: message="Bad Request"; break;
            case 401: message="Unauthorized"; break;
            case 403: message="Forbidden"; break;
            case 404: message="Not Found"; break;
            case 405: message="Method Not Allowed"; break;
            case 431: message="Request Header Fields Too Large"; break;
            default: message="Service Unavailable";
        }
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        String headers="HTTP/1.1 "+status+" "+message+"\r\n"+
                "Content-Type: application/json; charset=utf-8\r\n"+
                "Content-Length: "+bytes.length+"\r\n"+
                "Cache-Control: no-store\r\n"+
                "X-Content-Type-Options: nosniff\r\n"+
                "Referrer-Policy: no-referrer\r\n"+
                "Connection: close\r\n"+
                (cors?"Access-Control-Allow-Origin: "+WEB_ORIGIN+"\r\n"+
                     "Access-Control-Allow-Methods: GET, OPTIONS\r\n"+
                     "Access-Control-Allow-Headers: X-LifeSims-Key, Accept, Content-Type\r\n"+
                     "Access-Control-Allow-Private-Network: true\r\n"+
                     "Access-Control-Max-Age: 600\r\n"+
                     "Vary: Origin\r\n":"")+
                "\r\n";
        OutputStream out = socket.getOutputStream();
        out.write(headers.getBytes(StandardCharsets.US_ASCII));
        if (bytes.length>0)out.write(bytes);
        out.flush();
    }

    @Override
    public void onDestroy() {
        running = false;
        ServerSocket old = server;
        if (old != null) {
            try {old.close();} catch (IOException ignored) {}
        }
        if (worker != null) worker.interrupt();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
