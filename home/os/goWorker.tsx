import * as Comlink from "./comlink/comlink.ts";
import { Board } from "./goBoard.tsx";
const api = { Board };
export type WorkerAPI = typeof api;
Comlink.expose(api);