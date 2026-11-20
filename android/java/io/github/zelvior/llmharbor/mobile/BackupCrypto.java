package io.github.zelvior.llmharbor.mobile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.CipherOutputStream;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Passphrase encryption for portable backups. AES-256-GCM with a PBKDF2-SHA256
 * key, so a backup is useless without the passphrase the user chose — the
 * Android Keystore key never leaves the device.
 */
final class BackupCrypto {
    private static final byte[] MAGIC = {'O', 'S', 'B', '1'};
    private static final int SALT = 16, IV = 12, ITERATIONS = 150_000, BITS = 256;
    private static final SecureRandom RANDOM = new SecureRandom();

    private BackupCrypto() {}

    static OutputStream seal(OutputStream out, char[] passphrase) throws Exception {
        byte[] salt = new byte[SALT], iv = new byte[IV];
        RANDOM.nextBytes(salt);
        RANDOM.nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, derive(passphrase, salt), new GCMParameterSpec(128, iv));
        out.write(MAGIC);
        out.write(salt);
        out.write(iv);
        return new CipherOutputStream(out, cipher);
    }

    static InputStream open(InputStream in, char[] passphrase) throws Exception {
        byte[] header = new byte[MAGIC.length];
        if (readFully(in, header) != header.length) throw new IOException("Not a backup file");
        for (int i = 0; i < MAGIC.length; i++) {
            if (header[i] != MAGIC[i]) throw new IOException("Not a backup file");
        }
        byte[] salt = new byte[SALT], iv = new byte[IV];
        if (readFully(in, salt) != SALT || readFully(in, iv) != IV) throw new IOException("Truncated backup file");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, derive(passphrase, salt), new GCMParameterSpec(128, iv));
        return new CipherInputStream(in, cipher);
    }

    private static SecretKey derive(char[] passphrase, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(passphrase, salt, ITERATIONS, BITS);
        try {
            byte[] material = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return new SecretKeySpec(material, "AES");
        } finally {
            spec.clearPassword();
        }
    }

    static int readFully(InputStream in, byte[] target) throws IOException {
        int total = 0;
        while (total < target.length) {
            int read = in.read(target, total, target.length - total);
            if (read < 0) break;
            total += read;
        }
        return total;
    }

    static String base64(byte[] bytes) { return Base64.getEncoder().encodeToString(bytes); }
    static byte[] unbase64(String value) { return Base64.getDecoder().decode(value.getBytes(StandardCharsets.US_ASCII)); }
}
