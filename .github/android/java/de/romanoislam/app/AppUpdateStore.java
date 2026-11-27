package de.romanoislam.app;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Complete web snapshots. A running reader stays on one immutable version. */
public final class AppUpdateStore {
    public interface Remote { InputStream open(String relativePath) throws IOException; }
    private static final Object LOCK = new Object();
    private static final Set<String> SESSION_VERSIONS = new HashSet<>();
    private static final long MAX_ZIP = 128L * 1024 * 1024;
    private static final long MAX_TOTAL = 512L * 1024 * 1024;
    private static final int MAX_FILES = 4096;
    private static final String META = "romano-snapshot.json";
    private final File root;
    private final File sessionRoot;
    private final int nativeCode;

    public AppUpdateStore(File root, int nativeCode) throws IOException {
        this.root = root;
        this.nativeCode = nativeCode;
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create update store");
        synchronized (LOCK) {
            sessionRoot = readCurrent();
            if (sessionRoot != null) SESSION_VERSIONS.add(sessionRoot.getAbsolutePath());
        }
    }

    public boolean hasSnapshot() { return sessionRoot != null; }
    public String sessionId() { return sessionRoot == null ? "bundled" : sessionRoot.getName(); }

    /** Missing files in an active snapshot stay missing; never mix two releases. */
    public InputStream open(String path) throws IOException {
        if (sessionRoot == null) return null;
        return new FileInputStream(child(sessionRoot, path));
    }

    public boolean checkForUpdate(Remote remote) throws IOException {
        synchronized (LOCK) {
            File archive = null, stage = null;
            try {
                JSONObject release;
                try (InputStream input = remote.open("manifest.json")) {
                    release = new JSONObject(new String(readLimited(input, 65536), StandardCharsets.UTF_8));
                }
                if (release.getInt("protocol") != 1 || !"de.romanoislam.app".equals(release.getString("app")))
                    throw new IOException("Unsupported app update protocol");
                if (release.getInt("minimum_native_code") > nativeCode) return false;
                String id = release.getString("id"), hash = release.getString("archive_sha256");
                if (!hex(id) || !hex(hash)) throw new IOException("Invalid update digest");
                String name = release.getString("archive");
                if (!name.equals("app-" + id + ".zip")) throw new IOException("Invalid archive path");
                long zipSize = release.getLong("archive_size"), totalSize = release.getLong("uncompressed_size");
                int fileCount = release.getInt("file_count");
                if (zipSize <= 0 || zipSize > MAX_ZIP || totalSize < 0 || totalSize > MAX_TOTAL
                        || fileCount <= 0 || fileCount > MAX_FILES) throw new IOException("Update exceeds supported limits");
                File current = readCurrent();
                if (current != null && current.getName().equals(id)) return false;
                File target = new File(root, id);
                if (!complete(target)) {
                    archive = File.createTempFile("download-", ".zip", root);
                    MessageDigest digest = sha();
                    long received = 0;
                    try (InputStream input = remote.open(name); FileOutputStream output = new FileOutputStream(archive)) {
                        byte[] buffer = new byte[16384]; int n;
                        while ((n = input.read(buffer)) != -1) {
                            received += n;
                            if (received > zipSize) throw new IOException("Archive larger than declared");
                            output.write(buffer, 0, n); digest.update(buffer, 0, n);
                        }
                        output.getFD().sync();
                    }
                    if (received != zipSize || !hash.equals(hex(digest.digest()))) throw new IOException("Incomplete or invalid archive");
                    stage = File.createTempFile("stage-", "", root);
                    if (!stage.delete() || !stage.mkdir()) throw new IOException("Cannot stage update");
                    extract(archive, stage, id, fileCount, totalSize);
                    writeSynced(new File(stage, ".complete"), id.getBytes(StandardCharsets.US_ASCII));
                    if (target.exists()) deleteTree(target);
                    if (!stage.renameTo(target)) throw new IOException("Cannot commit snapshot");
                    stage = null;
                }
                File pending = new File(root, "current.tmp");
                writeSynced(pending, id.getBytes(StandardCharsets.US_ASCII));
                if (!pending.renameTo(new File(root, "current"))) throw new IOException("Cannot switch snapshot");
                // Keep the version used by this running Activity and the previously selected version.
                for (File file : list(root)) if (file.isDirectory() && hex(file.getName())
                        && !file.equals(target) && !SESSION_VERSIONS.contains(file.getAbsolutePath()) && !file.equals(current)) deleteTree(file);
                return true;
            } catch (JSONException error) {
                throw new IOException("Invalid update metadata", error);
            } finally {
                if (archive != null) archive.delete();
                if (stage != null) deleteTree(stage);
            }
        }
    }

    private void extract(File archive, File stage, String id, int count, long total) throws IOException, JSONException {
        try (ZipFile zip = new ZipFile(archive)) {
            ZipEntry metaEntry = zip.getEntry(META);
            if (metaEntry == null || metaEntry.isDirectory()) throw new IOException("Missing snapshot inventory");
            byte[] bytes;
            try (InputStream input = zip.getInputStream(metaEntry)) { bytes = readLimited(input, 4 * 1024 * 1024); }
            if (!id.equals(hex(sha().digest(bytes)))) throw new IOException("Snapshot inventory digest differs");
            JSONObject meta = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (meta.getInt("protocol") != 1 || !"de.romanoislam.app".equals(meta.getString("app")))
                throw new IOException("Wrong snapshot app");
            JSONArray entries = meta.getJSONArray("files");
            if (entries.length() != count) throw new IOException("Inventory count differs");
            Map<String, JSONObject> expected = new HashMap<>();
            long declared = 0;
            for (int i = 0; i < entries.length(); i++) {
                JSONObject item = entries.getJSONObject(i);
                String path = item.getString("path"); child(stage, path);
                long size = item.getLong("size");
                if (path.equals(META) || size < 0 || size > MAX_TOTAL || !hex(item.getString("sha256"))
                        || expected.put(path, item) != null) throw new IOException("Invalid file inventory");
                declared += size;
                if (declared > MAX_TOTAL) throw new IOException("Snapshot too large");
            }
            if (declared != total || !expected.containsKey("index.html")
                    || !expected.containsKey("assets/romano-pages.js")) throw new IOException("Incomplete app snapshot");
            Set<String> seen = new HashSet<>();
            Enumeration<? extends ZipEntry> iterator = zip.entries();
            while (iterator.hasMoreElements()) {
                ZipEntry entry = iterator.nextElement(); String path = entry.getName();
                if (!seen.add(path)) throw new IOException("Duplicate ZIP member");
                if (path.equals(META)) continue;
                JSONObject item = expected.get(path);
                if (item == null || entry.isDirectory()) throw new IOException("Unexpected ZIP member");
                File destination = child(stage, path), parent = destination.getParentFile();
                if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create app folder");
                MessageDigest digest = sha(); long received = 0, wanted = item.getLong("size");
                try (InputStream input = zip.getInputStream(entry); FileOutputStream output = new FileOutputStream(destination)) {
                    byte[] buffer = new byte[16384]; int n;
                    while ((n = input.read(buffer)) != -1) {
                        received += n;
                        if (received > wanted) throw new IOException("File larger than inventory");
                        output.write(buffer, 0, n); digest.update(buffer, 0, n);
                    }
                    output.getFD().sync();
                }
                if (received != wanted || !item.getString("sha256").equals(hex(digest.digest())))
                    throw new IOException("File digest differs: " + path);
            }
            if (seen.size() != expected.size() + 1) throw new IOException("Missing app files");
        }
    }

    private File readCurrent() {
        try (InputStream input = new FileInputStream(new File(root, "current"))) {
            String id = new String(readLimited(input, 64), StandardCharsets.US_ASCII);
            if (!hex(id)) return null;
            File directory = new File(root, id);
            return complete(directory) ? directory : null;
        } catch (IOException error) { return null; }
    }

    private static boolean complete(File directory) {
        try (InputStream input = new FileInputStream(new File(directory, ".complete"))) {
            return directory.isDirectory() && directory.getName().equals(new String(readLimited(input, 64), StandardCharsets.US_ASCII))
                    && new File(directory, "index.html").isFile() && new File(directory, "assets/romano-pages.js").isFile();
        } catch (IOException error) { return false; }
    }

    private static File child(File root, String path) throws IOException {
        if (path.isEmpty() || path.startsWith("/") || path.indexOf('\\') >= 0 || path.indexOf(':') >= 0 || path.indexOf('\0') >= 0)
            throw new IOException("Invalid app path");
        for (String part : path.split("/", -1)) if (part.isEmpty() || part.startsWith(".")) throw new IOException("Invalid app path");
        File file = new File(root, path);
        if (!file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IOException("Path outside app");
        return file;
    }

    private static byte[] readLimited(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int n;
        while ((n = input.read(buffer)) != -1) { if (output.size() + n > limit) throw new IOException("Metadata too large"); output.write(buffer, 0, n); }
        return output.toByteArray();
    }
    private static void writeSynced(File file, byte[] bytes) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); output.getFD().sync(); }
    }
    private static MessageDigest sha() { try { return MessageDigest.getInstance("SHA-256"); } catch (Exception impossible) { throw new AssertionError(impossible); } }
    private static boolean hex(String s) { return s != null && s.matches("[0-9a-f]{64}"); }
    private static String hex(byte[] bytes) { StringBuilder text = new StringBuilder(); for (byte b : bytes) text.append(String.format(Locale.ROOT, "%02x", b & 255)); return text.toString(); }
    private static File[] list(File directory) { File[] files = directory.listFiles(); return files == null ? new File[0] : files; }
    private static void deleteTree(File file) { for (File child : list(file)) deleteTree(child); file.delete(); }
}
