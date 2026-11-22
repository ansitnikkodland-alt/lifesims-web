package app.lifesims.screentime;

import android.app.Activity;
import android.app.AppOpsManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.security.SecureRandom;

public final class MainActivity extends Activity {
    public static final String PREFS = "lifesims-usage-bridge";
    public static final String TOKEN = "pairing-key";
    private TextView status;
    private TextView secretLabel;

    public static String pairingKey(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        String existing = prefs.getString(TOKEN, "");
        if (existing != null && existing.length() >= 32) return existing;
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String token = Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        prefs.edit().putString(TOKEN, token).apply();
        return token;
    }

    public static boolean hasUsageAccess(Context context) {
        AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(), context.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private TextView paragraph(String value, float sp) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(0xff13233c);
        view.setPadding(0, 9, 0, 13);
        return view;
    }

    private void addButton(LinearLayout parent, String name, View.OnClickListener action) {
        Button button = new Button(this);
        button.setText(name);
        button.setAllCaps(false);
        button.setOnClickListener(action);
        parent.addView(button, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(26, 28, 26, 30);
        root.setBackgroundColor(0xfff5f8fe);
        scroll.addView(root);
        setContentView(scroll);

        root.addView(paragraph("📱 LifeSims · Экранное время", 23));
        root.addView(paragraph("Собирает статистику использования приложений с Android и передаёт её только веб-LifeSims на этом же телефоне. Не связывается со StayFree и не использует Accessibility.", 15));
        status = paragraph("", 16);
        root.addView(status);
        addButton(root, "1. Разрешить доступ к статистике", v -> {
            try {
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception e) {
                try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); }
                catch (Exception ignored) {
                    Toast.makeText(this, "Открой настройки Android → Специальный доступ → Доступ к статистике", Toast.LENGTH_LONG).show();
                }
            }
        });
        addButton(root, "2. Запустить локальную передачу", v -> {
            if (!hasUsageAccess(this)) {
                Toast.makeText(this, "Сначала предоставь доступ к статистике", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                Intent service = new Intent(this, UsageBridgeService.class);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(service);
                else startService(service);
                status.postDelayed(this::refreshStatus, 350);
            } catch (RuntimeException e) {
                Toast.makeText(this, "Не удалось запустить локальную службу: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
        root.addView(paragraph("Код сопряжения (показывай только своим устройствам):", 14));
        secretLabel = paragraph(pairingKey(this), 12);
        secretLabel.setTextIsSelectable(true);
        secretLabel.setTextColor(0xff274c9a);
        root.addView(secretLabel);
        addButton(root, "3. Скопировать код сопряжения", v -> {
            ClipboardManager cb = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (cb != null) {
                cb.setPrimaryClip(ClipData.newPlainText("LifeSims pairing", pairingKey(this)));
                Toast.makeText(this, "Код скопирован", Toast.LENGTH_SHORT).show();
            }
        });
        addButton(root, "4. Открыть LifeSims в браузере", v -> {
            Intent open = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://ansitnikkodland-alt.github.io/lifesims-web/scene/?v=117"));
            startActivity(open);
        });
        addButton(root, "Остановить локальную передачу", v -> {
            stopService(new Intent(this, UsageBridgeService.class));
            status.postDelayed(this::refreshStatus, 200);
        });
        root.addView(paragraph(
                "В LifeSims открой «Календарь → Импорт экранного времени», вставь код и включи автоматическую синхронизацию. " +
                "Передача работает при запущенной локальной службе. Видно системное уведомление. " +
                "После перезагрузки телефона при необходимости запусти службу снова.", 14));
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (status != null) refreshStatus();
    }

    private void refreshStatus() {
        status.setText("Доступ к статистике: " + (hasUsageAccess(this) ? "✓ разрешён" : "⚠ не разрешён") +
                "\nЛокальная служба: " + (UsageBridgeService.running ? "✓ работает" : "○ остановлена") +
                "\nДанные передаются только через 127.0.0.1 — не в интернет.");
    }
}
