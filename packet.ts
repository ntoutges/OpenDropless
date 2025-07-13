export class PacketExplorer {
    private container: HTMLElement;
    private table: HTMLElement;
    
    // Call with -1 to indicate nothing hovered
    private readonly onHover: (idx: number) => void;
    private wasHovered: boolean = false;

    constructor(container: HTMLElement, onHover: (idx: number) => void) {
        this.container = container;
        this.container.classList.add('packet-explorer');
        this.onHover = onHover;

        this.table = document.createElement('div');
        this.table.classList.add('packet-table');
        this.container.appendChild(this.table);

        this.container.addEventListener("pointerenter", this.onEnter.bind(this), { capture: true });
        this.container.addEventListener("pointerleave", this.onLeave.bind(this), { capture: true });
    }

    public update(packet: number[]): void {
        this.table.innerHTML = '';

        const bytesPerRow = 4;
        for (let i = 0; i < packet.length; i += bytesPerRow) {
            const row = document.createElement('div');
            row.classList.add('packet-row');

            const offset = document.createElement('div');
            offset.classList.add('packet-offset');
            offset.textContent = `0x${i.toString(16).padStart(2, '0')}`;
            row.appendChild(offset);

            for (let j = 0; j < bytesPerRow; j++) {
                const byteIndex = i + j;
                const cell = document.createElement('div');
                cell.classList.add('packet-byte');

                if (byteIndex < packet.length) {
                    const byte = packet[byteIndex];
                    const hex = byte.toString(16).padStart(2, '0').toUpperCase();
                    const bits = Array.from(
                        byte.toString(2).padStart(8, '0')
                    ).map((bit, i) => `<span data-idx="${8*byteIndex + 7 - i}" class="${(bit == "1") ? "on" : ""}">${bit}</span>`).join("");

                    cell.innerHTML = `
                        <div class="byte-hex">${hex}</div>
                        <div class="byte-bits">${bits}</div>
                    `;
                } else {
                    cell.classList.add('empty');
                }

                row.appendChild(cell);
            }

            this.table.appendChild(row);
        }
    }

    private onEnter(e: PointerEvent) {
        if (!(e.target instanceof HTMLElement) || !e.target.matches(".byte-bits > *")) return;
        const idx = +(e.target.dataset.idx || -1);
        this.wasHovered = idx != -1;
        this.onHover(idx);
    }

    private onLeave(e: PointerEvent) {
        if (!this.wasHovered) return;
        this.wasHovered = false;
        this.onHover(-1);
    }
}
