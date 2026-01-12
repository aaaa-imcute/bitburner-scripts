import * as Comlink from "https://unpkg.com/comlink/dist/umd/comlink.js";
import { Board } from "./goBoard.tsx";
const api = { Board };
export type WorkerAPI = typeof api;
Comlink.expose(api);