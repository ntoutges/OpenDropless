type grid_base = {
    name: string;
    type: string;
    size: { x: number; y: number; };
    pos: { x: number; y: number; };
    packet: string;
}

type grid_tile = {
    type: "tile";
} & grid_base;

type grid_grid = {
    type: "grid";
    tile: { x: number; y: number; }
    invx?: boolean;
    invy?: boolean;
} & grid_base;

type grid_setup = (grid_base)[];

type grid_bounds = {
    x: number;
    y: number;
    w: number;
    h: number;
}

import grid from "./grid.html?raw";

export class Grid {
    private readonly element: HTMLElement;
    private readonly resizeObserver: ResizeObserver;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

    private readonly tiles = new Map<number, { bounds: grid_bounds, name: string, active: boolean }[]>();
    
    // Bounds of the tiles in internal units
    private readonly bounds: grid_bounds = { x: 0, y: 0, w: 1, h: 1 };

    private readonly highlights: HTMLElement[] = [];

    private scale: number = 10;

    constructor(parent: HTMLElement, setup: grid_setup) {
        parent.innerHTML = grid;
        this.element = parent.querySelector<HTMLElement>(".grid")!;
        this.canvas = this.element.querySelector<HTMLCanvasElement>("canvas")!;
        this.ctx = this.canvas.getContext("2d")!;

        this.resizeObserver = new ResizeObserver(this.resize.bind(this));
        this.resizeObserver.observe(this.element);

        this.canvas.addEventListener("pointermove", this.updateTooltip.bind(this));
        this.canvas.addEventListener("pointerleave", this.removeTooltip.bind(this));

        for (const gridItem of setup) {
            switch (gridItem.type) {
                case "tile":
                    this.buildTile(gridItem as grid_tile);
                    break;
                case "grid":
                    this.buildGrid(gridItem as grid_grid);
                    break;
                default:
                    console.log(`Unknown tile type: ${gridItem.name}`);
            }
        }
    }

    private buildTile(item: grid_tile) {
        const [byteStr, indexStr] = item.packet.split(":");
        const [byte, index] = [+byteStr, +indexStr];

        this._addTile(byte, index, {
            bounds: {
                x: item.pos.x,
                y: item.pos.y,
                w: item.size.x,
                h: item.size.y
            },
            name: item.name
        });
    }

    private buildGrid(item: grid_grid) {
        const cols = item.size.x / item.tile.x;
        const rows = item.size.y / item.tile.y;

        const [startByteStr, startIndexStr] = item.packet.split(":");
        const [startByte, startIndex] = [+startByteStr, +startIndexStr];

        let byte = startByte;
        let index = startIndex;

        const rowStep = item.invy ? -1 : 1;
        const rowStart = item.invy ? rows - 1 : 0;

        const colStep = item.invx ? -1 : 1;
        const colStart = item.invx ? cols-1 : 0;

        for (let col = colStart; col < cols && col >= 0; col += colStep) {
            for (let row = rowStart; row < rows && row >= 0; row += rowStep) {
                const x = item.pos.x + col*item.tile.x;
                const y = item.pos.y + row*item.tile.y;

                this._addTile(
                    byte,
                    index,
                    {
                        bounds: {
                            x,y,
                            w: item.tile.x,
                            h: item.tile.y
                        },
                        name: `${item.name} ${col}/${row}`
                    }
                )

                // Get next bit
                index++;
                if (index == 8) {
                    index = 0;
                    byte++;
                }
            }

            // Advance to the next available byte
            if (index != 0) {
                index = 0;
                byte++;
            }
        }
    }

    private _addTile(
        // Input data
        byte: number,
        index: number,

        // Display data
        data: { bounds: grid_bounds, name: string },
    ) {
        const idx = Grid.getBitfieldPos(byte, index);
        if(!this.tiles.has(idx)) this.tiles.set(idx, []);
        this.tiles.get(idx)!.push({
            ...data,
            active: false
        });

        if (data.bounds.x < this.bounds.x) this.bounds.x = data.bounds.x;
        if (data.bounds.y < this.bounds.y) this.bounds.y = data.bounds.y;
        if (data.bounds.x + data.bounds.w > this.bounds.x + this.bounds.w) this.bounds.w = data.bounds.x - this.bounds.x + data.bounds.w;
        if (data.bounds.y + data.bounds.h > this.bounds.y + this.bounds.h) this.bounds.h = data.bounds.y - this.bounds.y + data.bounds.h;
    }

    static getBitfieldPos(byte: number, index: number) {
        return 8*byte + index;
    }

    static fromBitfieldPos(index: number): [byte: number, index: number] {
        return [
            Math.floor(index / 8),
            index % 8
        ];
    }

    render() {
        this.scale = Math.min(this.canvas.width / this.bounds.w, this.canvas.height / this.bounds.h);
        this.canvas.style.aspectRatio = `${this.bounds.w} / ${this.bounds.h}`;

        this.ctx.clearRect(0,0, this.canvas.width, this.canvas.height);
        for (const id of this.tiles.keys()) {
            this.renderTile(id);
        }
    }

    /**
     * Call to update which cells are enabled
     * @param packets   A byte-array of the received packets
     */
    update(packets: number[]) {
        for (let byte in packets) {
            for (let index = 0; index < 8; index++) {
                this.setPacketState(
                    Grid.getBitfieldPos(+byte, index),
                    ((packets[byte] >> index) & 0x01) == 1
                );
            }
        }
    }

    clear() {
        for (const tiles of this.tiles.values()) {
            for (const tile of tiles) {
                tile.active = false;
            }
        }
        this.render();
    }

    /**
     * Emphasize some field
     * @param byte 
     * @param index 
     */
    highlight(byte: number, index: number) {
        this.removeHighlight();
        const idx = Grid.getBitfieldPos(byte, index);
        if (!this.tiles.has(idx)) return; // Invalid byte/index

        for (const tile of this.tiles.get(idx)!) {
            const highlight = document.createElement("div");
            highlight.classList.add("grid-highlights");

            const xPos = tile.bounds.x - this.bounds.x;
            const yPos = this.bounds.h - tile.bounds.y - tile.bounds.h + this.bounds.y;
            highlight.style.left = `${xPos * this.scale}px`;
            highlight.style.top = `${yPos * this.scale}px`;
            highlight.style.width = `${tile.bounds.w * this.scale}px`;
            highlight.style.height = `${tile.bounds.h * this.scale}px`;
        
            this.element.append(highlight);
            this.highlights.push(highlight);
        }
    }

    removeHighlight() {
        for (const highlight of this.highlights) {
            highlight.remove();
        }
        this.highlights.splice(0);
    }

    private setPacketState(idx: number, active: boolean) {
        if (!this.tiles.has(idx)) return; // Ignored packet

        for (const tile of this.tiles.get(idx)!) {
            tile.active = active;
        }
    }

    // Manage resizing
    private resize() {
        
        // Allow canvas to resize itself
        this.canvas.style.width = "";
        this.canvas.style.height = "";

        const width = this.canvas.offsetWidth;
        const height = this.canvas.offsetHeight;
        this.canvas.width = width;
        this.canvas.height = height;

        this.render();
    }

    private renderTile(id: number) {
        const tiles = this.tiles.get(id);
        if (!tiles) return; // Invalid tile; Ignore

        const padding = 1;

        const offset = padding / 2;
        for (let tile of tiles) {
            this.ctx.fillStyle = tile.active ? "#538ee0" : "#2b2b2b";

            const xPos = -this.bounds.x + tile.bounds.x;
            const yPos = this.bounds.y + this.bounds.h - tile.bounds.y - tile.bounds.h;

            this.ctx.clearRect(
                xPos * this.scale,
                yPos * this.scale,
                tile.bounds.w * this.scale,
                tile.bounds.h * this.scale
            );
            this.ctx.fillRect(
                xPos * this.scale + offset,
                yPos * this.scale + offset,
                tile.bounds.w * this.scale - padding,
                tile.bounds.h * this.scale - padding
            );
        }
    }

    // Update position+text of tooltip
    private updateTooltip(event: PointerEvent) {
        const base = this.canvas.getBoundingClientRect();
        
        // Get normalized coords
        const x = (event.clientX - base.x) / this.scale + this.bounds.x;
        const y = this.bounds.h - (event.clientY - base.y) / this.scale + this.bounds.y;

        let found: [idx: number, i: number] | null = null;

        // Find overlapping segment
        outer: for (const [idx, tiles] of this.tiles) {
            for (let i in tiles) {
                const tile = tiles[i];
                if (
                    tile.bounds.x < x &&
                    tile.bounds.x + tile.bounds.w > x &&
                    tile.bounds.y < y &&
                    tile.bounds.y + tile.bounds.h > y
                ) {
                    found = [idx, +i];
                }
            }
        }

        const tooltip = this.element.querySelector<HTMLDivElement>(".grid-tooltip")!;

        // No element found; Hide tooltip
        if (!found) {
            tooltip.style.display = "none";
            return;
        }

        const [byte, index] = Grid.fromBitfieldPos(found[0]);
        const tile = this.tiles.get(found[0])![found[1]];
        tooltip.querySelector<HTMLElement>(".tooltip-title")!.textContent = tile.name;
        tooltip.querySelector<HTMLElement>(".tooltip-id")!.textContent = `${byte}:${index}`;
        tooltip.querySelector<HTMLElement>(".tooltip-state")!.classList.toggle("on", tile.active);

        tooltip.style.display = "block";

        const xPos = tile.bounds.x - this.bounds.x;
        const yPos = this.bounds.h - tile.bounds.y - tile.bounds.h + this.bounds.y;

        tooltip.style.left = `${xPos * this.scale}px`;
        tooltip.style.top = `${yPos * this.scale}px`;

        // Reset to default
        tooltip.style.translate = "";
        const tBounds = tooltip.getBoundingClientRect();

        // Adjust offset to keep tooltip on-screen
        let tx = -100;
        let ty = -100;
        if (tBounds.left < base.left) tx = 0;
        if (tBounds.top < base.top) ty = 0;

        tooltip.style.translate = `${tx}% ${ty}%`;
    }

    private removeTooltip() {
        const tooltip = this.element.querySelector<HTMLDivElement>(".grid-tooltip")!;
        tooltip.style.display = "none";
    }

    destroy() {
        this.resizeObserver.disconnect();
    }
}