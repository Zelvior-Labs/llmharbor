package io.github.zelvior.llmharbor.mobile;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Wraps the database key with a non-exportable Android Keystore key, so the
 * plaintext key never sits on disk. The gateway receives it in its environment
 * for the lifetime of the service process only.
 */
final class KeyVault {
    private static final String STORE = "AndroidKeyStore";
    private static final String ALIAS = "llmharbor-data-key-v1";
    private static final String WRAPPED = ".encryption-key.enc";
    private static final String LEGACY = ".encryption-key";
    private static final SecureRandom RANDOM = new SecureRandom();

    private KeyVault() {}

    /** Returns the 64-character hex key, creating, migrating or unwrapping it. */
    static synchronized String load(File dataDir) throws Exception {
        File wrapped = new File(dataDir, WRAPPED);
        File legacy = new File(dataDir, LEGACY);
        File db = new File(dataDir, "freeapi.db");
        if (wrapped.isFile()) return unwrap(new String(Files.readAllBytes(wrapped.toPath()), StandardCharsets.UTF_8));
        if (legacy.isFile()) {
            String hex = new String(Files.readAllBytes(legacy.toPath()), StandardCharsets.UTF_8).trim();
            if (!hex.matches("[0-9a-fA-F]{64}")) throw new IOException("Invalid legacy key file");
            store(dataDir, hex);
            Files.deleteIfExists(legacy.toPath());
            return hex.toLowerCase();
        }
        if (db.isFile()) throw new IOException("Encryption key missing for existing data");
        String hex = randomHex();
        store(dataDir, hex);
        return hex;
    }

    /** Replaces any existing wrapped key. Used after restoring a backup. */
    static synchronized void store(File dataDir, String hex) throws Exception {
        if (hex == null || !hex.matches("[0-9a-fA-F]{64}")) throw new IOException("Invalid key for storage");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        byte[] body = cipher.doFinal(hex.toLowerCase().getBytes(StandardCharsets.UTF_8));
        String payload = "kv1:" + Base64.getEncoder().encodeToString(iv) + ":"
            + Base64.getEncoder().encodeToString(body);
        File staging = new File(dataDir, WRAPPED + ".new");
        try (FileOutputStream out = new FileOutputStream(staging)) {
            out.write(payload.getBytes(StandardCharsets.UTF_8));
            out.flush();
            out.getFD().sync();
        }
        Files.move(staging.toPath(), new File(dataDir, WRAPPED).toPath(),
            StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private static String unwrap(String payload) throws Exception {
        String[] parts = payload.trim().split(":");
        if (parts.length != 3 || !"kv1".equals(parts[0])) throw new IOException("Unknown key format");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey(),
            new GCMParameterSpec(128, Base64.getDecoder().decode(parts[1])));
        byte[] plain = cipher.doFinal(Base64.getDecoder().decode(parts[2]));
        String hex = new String(plain, StandardCharsets.UTF_8).trim();
        if (!hex.matches("[0-9a-fA-F]{64}")) throw new IOException("Invalid unwrapped key");
        return hex.toLowerCase();
    }

    private static SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance(STORE);
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE);
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(false)
            .build());
        return generator.generateKey();
    }

    private static String randomHex() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder(64);
        for (byte value : bytes) hex.append(String.format("%02x", value));
        return hex.toString();
    }
}
