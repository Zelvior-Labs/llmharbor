#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// Public node::Start entry, exported by the pinned nodejs-mobile full build.
namespace node { int Start(int argc, char** argv); }
extern "C" JNIEXPORT jint JNICALL
Java_io_github_zelvior_ossllmapi_mobile_GatewayService_runNode(
    JNIEnv* env, jclass, jstring script, jstring data, jstring temp,
    jstring key, jboolean lan, jboolean eco, jint heap) {
  const char* js = env->GetStringUTFChars(script, nullptr);
  const char* home = env->GetStringUTFChars(data, nullptr);
  const char* tmp = env->GetStringUTFChars(temp, nullptr);
  const char* secret = key ? env->GetStringUTFChars(key, nullptr) : nullptr;
  if (!js || !home || !tmp) return 1;
  setenv("HOME", home, 1);
  setenv("TMPDIR", tmp, 1);
  setenv("UV_THREADPOOL_SIZE", "2", 1);
  // The database key is unwrapped from the Android Keystore by the service and
  // lives only in this process's environment; nothing is written to disk.
  if (secret && *secret) setenv("OSSLLMAPI_ENCRYPTION_KEY", secret, 1);
  int megabytes = heap < 64 ? 64 : (heap > 512 ? 512 : heap);
  const std::vector<std::string> args = {
      "node", "--max-old-space-size=" + std::to_string(megabytes), js, home,
      lan ? "lan" : "local", eco ? "eco" : "normal"};
  env->ReleaseStringUTFChars(script, js);
  env->ReleaseStringUTFChars(data, home);
  env->ReleaseStringUTFChars(temp, tmp);
  if (secret) env->ReleaseStringUTFChars(key, secret);
  // libuv expects argv strings in contiguous writable storage.
  std::vector<char> buf;
  for (const auto& arg : args) buf.insert(buf.end(), arg.c_str(), arg.c_str() + arg.size() + 1);
  std::vector<char*> argv;
  char* p = buf.data();
  for (const auto& arg : args) { argv.push_back(p); p += arg.size() + 1; }
  argv.push_back(nullptr);
  return node::Start(static_cast<int>(args.size()), argv.data());
}
