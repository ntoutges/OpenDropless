import { Grid } from "./grid.js"
import { ConnectModal } from "./modal.js";
import { PacketExplorer } from "./packet.js";
import setup from "./setup.json"

const $ = document.querySelector.bind(document) as (s: string) => HTMLElement;

const g = new Grid($("#grid-container")!, setup);
g.render();

const e = new PacketExplorer($("#packet-container")!, (idx) => {
    if (idx == -1) {
        g.removeHighlight();
        return;
    }
    const [byte, index] = Grid.fromBitfieldPos(idx);
    g.highlight(byte, index);
});

const overlay = new ConnectModal(onConnect);
overlay.show();


var port: SerialPort | null = null;
var socket: WebSocket | null = null;
var reader: ReadableStreamDefaultReader<any> | null = null;
var paused: boolean = false;

function onConnect(mode: "ser" | "sok") {
    switch (mode) {
        case "ser":
            onConnectSer();
            break;
        case "sok":
            onConnectSok("http://localhost:3000/");
            break;
    }
}

async function onConnectSer() {
    // Indicate the lack of serial availability
    if (!navigator.serial) {
        overlay.error("The Web Serial API is not available on your browser.");
        return;
    }

    // Clear the current error
    overlay.error("");

    try {
        const p = await navigator.serial.requestPort();
        await p.open({ baudRate: 115200 });

        port = p;
        overlay.hide();
        paused = false;
        $("#rx-toggle")!.classList.remove("paused");
        startPortRead();
    }
    catch(err) {
        overlay.error(typeof err == "string" ? err : (err as Error).message);
    }
}

function onConnectSok(host: string) {
    socket = new WebSocket(host);

    // Socket connection ready!
    socket.onopen = (ev) => {
        overlay.hide();
    }

    socket.onclose = (ev) => {
        $("#disconnect")!.click();
    }

    socket.onmessage = (ev) => {
        const packet = ev.data.split(",").map((b: string) => +b.trim());
        onPacket(packet);
    }
}

const TX_LEN = 32; // Number of bytes per packet
const TX_GAP = 20; // Minimum ms between packets

async function startPortRead() {
    if (!port) return;

    const bytes = [];
    let lastTX = null;
    outer: while (port.readable) {
        reader = port.readable.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                
                // Reader has eben canceled
                if (done) break outer;

                const now = performance.now();
                const isTimeout = (lastTX && (now - lastTX) > TX_GAP);
                if (bytes.length >= TX_LEN || isTimeout) {
                    const packet = isTimeout ? bytes.splice(0) : bytes.splice(0, TX_LEN);
                    onPacket(packet);
                }

                lastTX = now;
                bytes.push(...(value as Uint8Array));
            }
        }
        catch(err) {
            $("#disconnect")!.click(); // Disconnect
            console.log("Disconnected!");
        }
        finally {
            reader.releaseLock();
        }
    }
}

function onPacket(packet: number[]) {
    if (paused) return;
    g.update(packet);
    g.render();
    e.update(packet);
}

$("#rx-toggle")!.addEventListener("click", () => {
    $("#rx-toggle")!.classList.toggle("paused");
    paused = $("#rx-toggle")!.classList.contains("paused");
});

$("#disconnect")!.addEventListener("click", async () => {
    if (port) {
        if (reader) {
            await reader.cancel();
            await reader.releaseLock();
            reader = null;
        }

        await port.close();
        port = null;
    }

    if (socket) {
        socket.close();
        socket = null;
    }

    overlay.show();
});

document.body.addEventListener("keydown", (e) => {
    if (e.key == " ") $("#rx-toggle")!.click();
});
