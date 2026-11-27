import de.romanoislam.app.AppUpdateStore;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

public final class AppUpdateStoreTest {
    private static File fixtures;
    private static int assertions;
    private static void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
    private static String text(AppUpdateStore store, String path) throws IOException {
        try (InputStream input = store.open(path)) {
            if (input == null) return "bundled";
            ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] b = new byte[1024]; int n;
            while ((n = input.read(b)) != -1) out.write(b, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    private static AppUpdateStore.Remote remote(String fixture) {
        return path -> new FileInputStream(new File(new File(fixtures, fixture), path));
    }
    private static void rejects(AppUpdateStore store, String fixture, String previous) throws Exception {
        boolean failed = false;
        try { store.checkForUpdate(remote(fixture)); } catch (IOException expected) { failed = true; }
        check(failed, "Invalid update must fail: " + fixture);
        AppUpdateStore reopened = new AppUpdateStore(new File(fixtures, "store"), 11);
        check(previous.equals(reopened.sessionId()), "Invalid update changed active snapshot: " + fixture);
        check("FIRST".equals(text(reopened, "index.html")), "Invalid update changed app HTML");
    }
    public static void main(String[] args) throws Exception {
        fixtures = new File(args[0]); File root = new File(fixtures, "store");
        AppUpdateStore first = new AppUpdateStore(root, 11);
        check(!first.hasSnapshot(), "First offline launch must use bundled app");
        check("bundled".equals(text(first, "index.html")), "Bundled fallback absent");
        check(first.checkForUpdate(remote("v1")), "First complete snapshot not installed");
        check(!first.hasSnapshot(), "Running app switched during reading");
        AppUpdateStore old = new AppUpdateStore(root, 11); String previous = old.sessionId();
        check(old.hasSnapshot(), "Complete snapshot not available offline on next launch");
        check("FIRST".equals(text(old, "index.html")), "Wrong first HTML");
        check("old-js".equals(text(old, "obsolete.js")), "First JS absent");
        check(!old.checkForUpdate(path -> { if (!path.equals("manifest.json")) throw new IOException("Unchanged archive downloaded"); return remote("v1").open(path); }), "Unchanged version downloaded again");
        for (String fixture : new String[]{"bad-hash", "bad-file", "traversal", "missing-file", "duplicate-file", "extra-file", "wrong-app", "bad-size", "invalid-json"}) rejects(old, fixture, previous);
        boolean interrupted = false;
        try {
            old.checkForUpdate(path -> {
                InputStream input = remote("v2").open(path);
                if (path.equals("manifest.json")) return input;
                return new FilterInputStream(input) {
                    private int read;
                    @Override public int read(byte[] b, int off, int length) throws IOException {
                        if (read >= 32) throw new IOException("Simulated interrupted network");
                        int n = super.read(b, off, Math.min(32, length)); if (n > 0) read += n; return n;
                    }
                };
            });
        } catch (IOException expected) { interrupted = true; }
        check(interrupted, "Network interruption not simulated");
        check(previous.equals(new AppUpdateStore(root, 11).sessionId()), "Partial download activated");
        check(!old.checkForUpdate(path -> { if (!path.equals("manifest.json")) throw new IOException("Unsupported archive downloaded"); return remote("native-too-new").open(path); }), "Unsupported native version accepted");
        check(old.checkForUpdate(remote("v2")), "Second full snapshot did not install");
        check("FIRST".equals(text(old, "index.html")), "Existing reader changed in mid-session");
        check("old-js".equals(text(old, "obsolete.js")), "Existing reader lost old JS during update");
        AppUpdateStore latest = new AppUpdateStore(root, 11);
        check(!previous.equals(latest.sessionId()), "New snapshot not activated on next launch");
        check("SECOND".equals(text(latest, "index.html")), "HTML did not update");
        check("new-css".equals(text(latest, "style.css")), "CSS did not update");
        check("new-js".equals(text(latest, "assets/romano-pages.js")), "JS did not update");
        check("new-image".equals(text(latest, "images/test.png")), "Image did not update");
        check("new-font".equals(text(latest, "fonts/test.ttf")), "Font did not update");
        check("new-json".equals(text(latest, "data/test.json")), "JSON did not update");
        check("nova-rubrika".equals(text(latest, "readers/new.html")), "New section did not update");
        boolean deleted = false;
        try { text(latest, "obsolete.js"); } catch (IOException expected) { deleted = true; }
        check(deleted, "Deleted file leaked back from previous/bundled version");
        boolean offline = false;
        try { latest.checkForUpdate(path -> { throw new IOException("offline"); }); } catch (IOException expected) { offline = true; }
        check(offline && "SECOND".equals(text(latest, "index.html")), "Offline fallback failed");
        boolean unsafe = false;
        try { text(latest, "../escape"); } catch (IOException expected) { unsafe = true; }
        check(unsafe, "Unsafe local resource path accepted");
        for (File file : root.listFiles()) check(!file.getName().startsWith("stage-") && !file.getName().startsWith("download-"), "Incomplete temporary download left behind");
        System.out.println("PASS: " + assertions + " update assertions: all app file types, atomic activation, interrupted/corrupt downloads, deletion, offline, and fixed reading session.");
    }
}
