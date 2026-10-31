import { render } from "preact";
import "@skmate/ui/src/tokens.css";
import "@skmate/ui/src/ui.css";
import "./app.css";
import { App } from "./App";
import { fitStage, installPointer } from "@skmate/ui";
import { detectPlatform, registerRemoteKeys } from "./platform";

registerRemoteKeys(detectPlatform());
fitStage();
installPointer();
render(<App />, document.getElementById("app") as HTMLElement);
