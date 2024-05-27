let imageData;
let currentTrace = new Map();
let simplifiedTrace = new Map();
let previousTrace = new Map();

const funcs = [[(j, z) => j + z, 1], [(j, z) => j - z, 0]]; // the functional parameters go crazy
let colours = [];

onmessage = (e) => {
    switch (e.data[0]) {
        case "clear": {
            currentTrace.clear();
            simplifiedTrace.clear();
            break;
        }
        case "undo": {
            cleanUpData(previousTrace);
            postMessage(["done", simplifiedTrace]);
            currentTrace = new Map(JSON.parse(JSON.stringify(Array.from(previousTrace))));
            break;
        }
        case "get": {
            postMessage(["done", simplifiedTrace]);
            break;
        }
        case "export": {
            const lowFR = parseInt(e.data[5]), highFR = parseInt(e.data[6]);
            const FRprec = parseInt(e.data[7]), SPLprec = parseInt(e.data[8]);

            // SPL Stuff
            const SPLBot = parseInt(e.data[2][0]), SPLBotPixel = parseInt(e.data[2][1]);
            // (top SPL value - bottom SPL value) / (top SPL pixel - bottom SPL pixel)
            const SPLRatio = (parseInt(e.data[1][0]) - SPLBot) / (parseInt(e.data[1][1]) - SPLBotPixel);

            // FR Stuff
            const FRBotPixel = parseInt(e.data[4][1]), logFRBot = Math.log10(e.data[4][0]);
            // (log10(top FR value) - log10(bottom FR value)) / (top FR pixel - bottom FR pixel)
            const FRRatio = (Math.log10(e.data[3][0]) - logFRBot) / (e.data[3][1] - FRBotPixel);

            const export_string = new exportString();

            let freq = 1, spl = 1, minAdded = false;
            for (let entry of simplifiedTrace) {
                freq = Math.pow(10, ((parseInt(entry[0]) - FRBotPixel) * FRRatio) + logFRBot);
                spl = (((parseInt(entry[1]) - SPLBotPixel) * SPLRatio) + SPLBot).toFixed(SPLprec);
                if (freq >= lowFR) {
                    if (!minAdded && freq !== lowFR) {
                        export_string.addData(lowFR.toFixed(FRprec), spl);
                        minAdded = true;
                    }
                    export_string.addData(freq.toFixed(FRprec), spl);
                    if (freq > highFR) break;
                }
            }
            if (freq <= highFR) {
                export_string.addData(highFR.toFixed(FRprec), spl);
            }
            postMessage(["export", export_string.data]);
            break;
        }
        case "point": {
            savePreviousTrace();
            currentTrace.set(parseInt(e.data[1]), parseInt(e.data[2]));
            cleanUpData(currentTrace);
            postMessage(["done", simplifiedTrace]);
            break;
        }
        case "setData": {
            imageData = e.data[1];
            break;
        }
        case "trace": {
            // TODO: octave smoothing
            savePreviousTrace();
            const x = parseInt(e.data[1]);
            const y = parseInt(e.data[2]);
            const maxLineHeight = Math.max(0, Math.floor(imageData.height * 0.05) + parseIntDefault(e.data[3], 0));
            const tolerance = parseInt(e.data[4]);
            const maxJump = Math.max(0, Math.floor(imageData.width * 0.02)) + parseIntDefault(e.data[5], 0);

            const colour = new RGB(x, y, tolerance);

            trace(x, (x) => x >= 0, -1);
            trace(x + 1, (x) => x < imageData.width, 1);

            cleanUpData(currentTrace);
            postMessage(["done", simplifiedTrace]);

            function trace(start, loop_func, step) {
                let n, m = 0, j = y;
                for (let i = start; loop_func(i); i += step) {
                    colours = [];
                    for (let [func, start] of funcs) {
                        for (let z = start; z <= maxLineHeight + m; z++) {
                            n = Math.max(0, Math.min(imageData.height - 1, func(j, z)));
                            if (colour.withinTolerance(i, n)) colours.push(n);
                        }
                    }
                    if (colours.length > 0) {
                        m = 0;
                        colours.sort((a, b) => a - b);
                        j = colours[Math.floor(colours.length / 2)];
                        currentTrace.set(i, j);
                        colour.addToAverage(i, j);
                        continue;
                    }
                    if (m < maxJump) m++;
                    else break;
                }
            }
            break;
        }
    }
}

class RGB {
    R;
    G;
    B;
    values = 1;
    constructor(x, y, tolerance) {
        this.tolerance = tolerance;
        [this.R, this.G, this.B] = RGB.getRGB(x, y);
    }

    withinTolerance(x, y) {
        const [newR, newG, newB] = RGB.getRGB(x, y);
        const rmean = (this.R + newR) / 2;
        const r = this.R - newR;
        const g = this.G - newG;
        const b = this.B - newB;
        return Math.sqrt((((512+rmean)*r*r)>>8) + 4*g*g + (((767-rmean)*b*b)>>8)) <= this.tolerance;
    }

    addToAverage(x, y) {
        const [newR, newG, newB] = RGB.getRGB(x, y);
        this.R += Math.max(0, Math.min(255, (Math.sqrt((Math.pow(this.R, 2) + Math.pow(newR, 2)) / 2) - this.R) / this.values));
        this.G += Math.max(0, Math.min(255, (Math.sqrt((Math.pow(this.G, 2) + Math.pow(newG, 2)) / 2) - this.G) / this.values));
        this.B += Math.max(0, Math.min(255, (Math.sqrt((Math.pow(this.B, 2) + Math.pow(newB, 2)) / 2) - this.B) / this.values));
        this.values++;
    }

    static getRGB(x, y) {
        return [imageData.data[(y * imageData.width * 4) + (x * 4)], // R
                imageData.data[(y * imageData.width * 4) + (x * 4) + 1], // G
                imageData.data[(y * imageData.width * 4) + (x * 4) + 2]]; // B
    }
}

class exportString {
    data = `* Exported with UsyTrace, available at https://usyless.github.io/
Freq(Hz) SPL(dB)`
    addData(freq, spl) {
        this.data += `
${freq.toString()} ${spl.toString()}`
    }
}

function cleanUpData(data) {
    if (data.size > 2) {
        data = new Map([...data.entries()].sort((a, b) => a[0] - b[0]));
        simplifiedTrace = new Map();
        let z, avg, n = data.entries().next().value[0], identity = [], finalKey, finalValue;
        simplifiedTrace.set(n, data.get(n));
        for (let i = n + 1; i < imageData.width; i++) {
            z = data.get(i);
            if (z) {
                finalValue = z;
                identity = [];
                for (let j = i; data.get(j) === z; j++) {
                    finalKey = j;
                    identity.push(j);
                }
                if (identity.length === 1) {
                    simplifiedTrace.set(i, data.get(i));
                } else {
                    avg = identity.reduce((a, b) => a + b, 0) / identity.length;
                    simplifiedTrace.set(avg, data.get(i));
                    i += identity.length - 1;
                }
            }
        }
        simplifiedTrace.set(finalKey, finalValue);
    }
    else {
        simplifiedTrace = data;
    }
}

function parseIntDefault(a, def) {
    let i = parseInt(a);
    if (i) return i;
    return def;
}

function savePreviousTrace() {
    previousTrace = new Map(JSON.parse(JSON.stringify(Array.from(currentTrace))));
}
