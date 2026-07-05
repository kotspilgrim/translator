import { NativeModule, requireNativeModule } from 'expo';
import type { MlkitLanguageCode } from './MlkitTranslate.types';

declare class MlkitTranslateModule extends NativeModule<{}> {
  isModelDownloaded(languageCode: MlkitLanguageCode): Promise<boolean>;
  downloadModel(languageCode: MlkitLanguageCode, requireWifi: boolean): Promise<void>;
  deleteModel(languageCode: MlkitLanguageCode): Promise<void>;
  translate(
    text: string,
    sourceLanguageCode: MlkitLanguageCode,
    targetLanguageCode: MlkitLanguageCode
  ): Promise<string>;
}

export default requireNativeModule<MlkitTranslateModule>('MlkitTranslate');
