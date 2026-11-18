#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// Public node::Start entry, exported by the pinned nodejs-mobile full build.
namespace node { int Start(int argc, char** argv); }
extern "C" JNIEXPORT jint JNICALL
Java_io_github_zelvior_ossllmapi_mobile_GatewayService_runNode(
    JNIEnv* env, jclass, jstring script, jstring data, jstring temp) {
  const char* js = env->GetStringUTFChars(script, nullptr);
  const char* home = env->GetStringUTFChars(data, nullptr);
  const char* tmp = env->GetStringUTFChars(temp, nullptr);
  if (!js || !home || !tmp) return 1;
  setenv("HOME", home, 1);
  setenv("TMPDIR", tmp, 1);
  setenv("UV_THREADPOOL_SIZE", "2", 1);
  const std::vector<std::string> args = {"node", "--max-old-space-size=160", js, home};
  env->ReleaseStringUTFChars(script, js);
  env->ReleaseStringUTFChars(data, home);
  env->ReleaseStringUTFChars(temp, tmp);
  // libuv expects argv strings in contiguous writable storage.
  std::vector<char> buf;
  for (const auto& arg : args) buf.insert(buf.end(), arg.c_str(), arg.c_str() + arg.size() + 1);
  std::vector<char*> argv;
  char* p = buf.data();
  for (const auto& arg : args) { argv.push_back(p); p += arg.size() + 1; }
  argv.push_back(nullptr);
  return node::Start(static_cast<int>(args.size()), argv.data());
}
