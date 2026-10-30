import { render } from "preact";
import "@skmate/ui/src/tokens.css";
import "@skmate/ui/src/ui.css";
import "./app.css";
import { App } from "./App";
import { detectPlatform, registerRemoteKeys } from "./platform";

registerRemoteKeys(detectPlatform());
render(<App />, document.getElementById("app") as HTMLElement);
