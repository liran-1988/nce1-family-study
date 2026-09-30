package family.nce1.offline;

import java.util.Locale;

final class MediaRules {
    private MediaRules() {}
    static boolean lesson(int number) { return number >= 1 && number <= 144; }
    static boolean relative(String path) {
        if (path == null || path.length() == 0 || path.length() > 512 || path.startsWith("/")) return false;
        if (path.contains("\\") || path.contains(":") || path.contains("%") || path.contains("?") || path.contains("#")) return false;
        for (int i = 0; i < path.length(); i++) if (Character.isISOControl(path.charAt(i))) return false;
        for (String part : path.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) return false;
        }
        return true;
    }
    static boolean video(String path) {
        if (!relative(path)) return false;
        String p = path.toLowerCase(Locale.ROOT);
        return p.endsWith(".webm") || p.endsWith(".mp4") || p.endsWith(".mkv") || p.endsWith(".3gp");
    }
    static boolean pdf(String name) {
        return "student".equals(name) || "workbook".equals(name) || "teacher".equals(name);
    }
}
