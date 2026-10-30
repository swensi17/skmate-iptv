import { jsx as _jsx } from "preact/jsx-runtime";
import { render } from "preact";
import "@skmate/ui/src/tokens.css";
import "@skmate/ui/src/ui.css";
import "./app.css";
import { App } from "./App";
import { detectPlatform, registerRemoteKeys } from "./platform";
registerRemoteKeys(detectPlatform());
render(_jsx(App, {}), document.getElementById("app"));
