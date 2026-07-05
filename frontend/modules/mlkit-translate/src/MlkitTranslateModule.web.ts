import { registerWebModule, NativeModule } from 'expo';

// MlkitTranslateModule is not available on the web platform.
class MlkitTranslateModule extends NativeModule<{}> {}

export default registerWebModule(MlkitTranslateModule, 'MlkitTranslateModule');
