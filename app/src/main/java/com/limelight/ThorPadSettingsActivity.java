package com.limelight;

import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * On-device manager for ThorPad layout JSON files: list / create-per-app / edit /
 * save-and-hot-reload / delete. The richer drag-and-drop builder is the web tool
 * (tools/thorpad-webui); this is for quick on-the-couch tweaks.
 */
public class ThorPadSettingsActivity extends AppCompatActivity {

    private File dir;
    private String appName;
    private Spinner fileSpinner;
    private EditText editor;
    private EditText newNameField;
    private List<String> files = new ArrayList<>();
    private String currentFile;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("ThorPad Settings");

        appName = getIntent() != null ? getIntent().getStringExtra(ThorPadActivity.EXTRA_APP_NAME) : null;
        dir = new File(getExternalFilesDir(null), "thorpad");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(16), dp(16), dp(16), dp(16));
        col.setBackgroundColor(Color.parseColor("#0B0E14"));

        col.addView(label("Streaming app:  " + (appName == null ? "—" : appName), "#7AA2F7", 14));
        col.addView(label("Layouts folder (edit over USB too):\n" + dir.getAbsolutePath(), "#565F89", 10));

        // New-for-this-app
        Button newForApp = button("＋ New layout for this app");
        newForApp.setEnabled(appName != null && !appName.isEmpty());
        newForApp.setOnClickListener(v -> createFile(sanitize(appName)));
        col.addView(newForApp);

        // New with a custom name
        LinearLayout newRow = new LinearLayout(this);
        newRow.setOrientation(LinearLayout.HORIZONTAL);
        newNameField = new EditText(this);
        newNameField.setHint("new layout name");
        newNameField.setTextColor(Color.WHITE);
        newNameField.setHintTextColor(Color.parseColor("#565F89"));
        newRow.addView(newNameField, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button createBtn = button("Create");
        createBtn.setOnClickListener(v -> {
            String n = newNameField.getText().toString().trim();
            if (n.isEmpty()) { toast("Enter a name"); return; }
            createFile(sanitize(n));
            newNameField.setText("");
        });
        newRow.addView(createBtn, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        col.addView(newRow);

        col.addView(label("Edit a layout file:", "#C0CAF5", 13));

        fileSpinner = new Spinner(this);
        fileSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                currentFile = files.get(pos);
                editor.setText(readFile(new File(dir, currentFile)));
            }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });
        col.addView(fileSpinner);

        editor = new EditText(this);
        editor.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        editor.setGravity(Gravity.TOP | Gravity.START);
        editor.setTypeface(Typeface.MONOSPACE);
        editor.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        editor.setTextColor(Color.parseColor("#C0CAF5"));
        editor.setBackgroundColor(Color.parseColor("#11151F"));
        editor.setPadding(dp(8), dp(8), dp(8), dp(8));
        col.addView(editor, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(260)));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button save = button("💾 Save & Apply");
        save.setOnClickListener(v -> saveAndApply());
        Button delete = button("🗑 Delete");
        delete.setOnClickListener(v -> deleteCurrent());
        actions.addView(save, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        actions.addView(delete, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        col.addView(actions);

        col.addView(label("\"Save & Apply\" hot-reloads the live pad — no stream restart.",
                "#565F89", 10));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(col);
        setContentView(scroll);

        refreshFiles(null);
    }

    private void refreshFiles(String select) {
        String[] names = dir.list((d, name) -> name.endsWith(".json"));
        files = new ArrayList<>(Arrays.asList(names == null ? new String[0] : names));
        java.util.Collections.sort(files);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, files);
        fileSpinner.setAdapter(adapter);
        if (select != null && files.contains(select)) {
            fileSpinner.setSelection(files.indexOf(select));
        }
    }

    private void createFile(String base) {
        File f = new File(dir, base + ".json");
        if (!f.exists()) {
            writeFile(f, ThorPadActivity.DEFAULT_LAYOUT_JSON);
        }
        refreshFiles(f.getName());
        toast("Created " + f.getName());
    }

    private void saveAndApply() {
        if (currentFile == null) {
            toast("Pick a file first");
            return;
        }
        String text = editor.getText().toString();
        try {
            new JSONObject(text); // validate
        } catch (Exception e) {
            toast("Invalid JSON: " + e.getMessage());
            return;
        }
        writeFile(new File(dir, currentFile), text);
        if (ThorPadActivity.instance != null) {
            ThorPadActivity.instance.runOnUiThread(() -> ThorPadActivity.instance.applyLayout());
            toast("Saved & applied to the pad");
        } else {
            toast("Saved (pad not running)");
        }
    }

    private void deleteCurrent() {
        if (currentFile == null) {
            return;
        }
        File f = new File(dir, currentFile);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
        toast("Deleted " + currentFile);
        currentFile = null;
        editor.setText("");
        refreshFiles(null);
        if (ThorPadActivity.instance != null) {
            ThorPadActivity.instance.runOnUiThread(() -> ThorPadActivity.instance.applyLayout());
        }
    }

    private static String sanitize(String name) {
        return name.toLowerCase().replaceAll("[^a-z0-9-_]+", "_");
    }

    private TextView label(String text, String color, int sp) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(Color.parseColor(color));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setPadding(0, dp(8), 0, dp(4));
        return t;
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        return b;
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    private static String readFile(File f) {
        if (f == null || !f.exists()) {
            return "";
        }
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int read = 0;
            while (read < buf.length) {
                int n = in.read(buf, read, buf.length - read);
                if (n < 0) break;
                read += n;
            }
            return new String(buf, 0, read, "UTF-8");
        } catch (IOException e) {
            return "";
        }
    }

    private static void writeFile(File f, String content) {
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(content.getBytes("UTF-8"));
        } catch (IOException ignored) {
        }
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
