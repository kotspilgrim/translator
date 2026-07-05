package expo.modules.mlkittranslate

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private class UnsupportedLanguageException(code: String) :
  CodedException("Язык не поддерживается ML Kit: $code")

// Task<T> callbacks bridged straight to Expo's Promise — no kotlinx-coroutines
// dependency, so there's no risk of a Kotlin-metadata-version clash with
// whatever coroutines version this app's other dependencies happen to pull in.
private fun <T> com.google.android.gms.tasks.Task<T>.resolveWith(promise: Promise) {
  addOnSuccessListener { promise.resolve(it) }
  addOnFailureListener { promise.reject("ERR_MLKIT_TRANSLATE", it.message, it) }
}

class MlkitTranslateModule : Module() {
  private val modelManager by lazy { RemoteModelManager.getInstance() }

  private fun languageTag(code: String): String =
    TranslateLanguage.fromLanguageTag(code) ?: throw UnsupportedLanguageException(code)

  private fun remoteModel(code: String): TranslateRemoteModel =
    TranslateRemoteModel.Builder(languageTag(code)).build()

  override fun definition() = ModuleDefinition {
    Name("MlkitTranslate")

    // Whether the on-device model for this language is already downloaded.
    AsyncFunction("isModelDownloaded") { languageCode: String, promise: Promise ->
      modelManager.isModelDownloaded(remoteModel(languageCode)).resolveWith(promise)
    }

    // Explicit download, driven from the language-packs screen — not called
    // implicitly from translate() so the UI stays in control of when a ~30MB
    // model download happens.
    AsyncFunction("downloadModel") { languageCode: String, requireWifi: Boolean, promise: Promise ->
      val conditions = DownloadConditions.Builder().apply {
        if (requireWifi) requireWifi()
      }.build()
      modelManager.download(remoteModel(languageCode), conditions).resolveWith(promise)
    }

    AsyncFunction("deleteModel") { languageCode: String, promise: Promise ->
      modelManager.deleteDownloadedModel(remoteModel(languageCode)).resolveWith(promise)
    }

    // Assumes both models are already downloaded (checked/managed via the
    // language-packs screen) — fails clearly instead of silently downloading
    // ~30MB over a metered connection mid-translation.
    AsyncFunction("translate") { text: String, sourceLanguageCode: String, targetLanguageCode: String, promise: Promise ->
      val options = TranslatorOptions.Builder()
        .setSourceLanguage(languageTag(sourceLanguageCode))
        .setTargetLanguage(languageTag(targetLanguageCode))
        .build()
      val translator = Translation.getClient(options)
      translator.translate(text)
        .addOnSuccessListener {
          translator.close()
          promise.resolve(it)
        }
        .addOnFailureListener {
          translator.close()
          promise.reject("ERR_MLKIT_TRANSLATE", it.message, it)
        }
    }
  }
}
