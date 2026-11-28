import { render } from "preact";
import "@skmate/ui/src/tokens.css";
import "@skmate/ui/src/ui.css";
import "./app.css";
import { App } from "./App";
import { fitStage, installLayout, installLegacySupport, installPointer } from "@skmate/ui";
import { detectPlatform, registerRemoteKeys } from "./platform";
import { installAndroidBack } from "./platform/android";
import { installVideoPlane } from "./platform/videoPlane";
import { loadLanguage } from "./i18n";
import { load } from "./state/settings";

// First: old TV engines (Chromium 53-63) get `html.no-flex-gap` and a few polyfills before anything is drawn.
installLegacySupport();
registerRemoteKeys(detectPlatform());
installLayout(); // data-layout / data-input on <html>; before fitStage, which stands down in the compact layout
fitStage();
installAndroidBack();
installPointer();
installVideoPlane();
// The chosen language is fetched before the first frame, so the screen never flashes in another one.
const start = () => render(<App />, document.getElementById("app") as HTMLElement);
void loadLanguage(load().language).then(start, start);
