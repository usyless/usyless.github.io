'use strict';

let imageData;
let currentTrace = new Map();
let simplifiedTrace = [];
let previousTrace = new Map();
let traceColour = '#ff0000';
let previousColour;

const funcs = [[(j, z) => j + z, 1], [(j, z) => j - z, 0]]; // the functional parameters go crazy
let colours = [];

onmessage = (e) => {
    switch (e.data['type']) {
        case "clear": {
            clearTrace();
            break;
        }
        case "undo": {
            undoTrace();
            break;
        }
        case "export": {
            exportTrace(e.data);
            break;
        }
        case "point": {
            addPoint(parseInt(e.data['x'], 10), parseInt(e.data['y'], 10));
            break;
        }
        case "setData": {
            imageData = e.data['imageData'];
            break;
        }
        case "auto": {
            autoTrace(e.data);
            break;
        }
        case "trace": {
            trace(e.data);
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
        return Math.sqrt((((512 + rmean) * r * r) >> 8) + 4 * g * g + (((767 - rmean) * b * b) >> 8)) <= this.tolerance;
    }

    addToAverage(x, y) {
        const [newR, newG, newB] = RGB.getRGB(x, y);
        this.R += (Math.sqrt((Math.pow(this.R, 2) + Math.pow(newR, 2)) / 2) - this.R) / this.values;
        this.G += (Math.sqrt((Math.pow(this.G, 2) + Math.pow(newG, 2)) / 2) - this.G) / this.values;
        this.B += (Math.sqrt((Math.pow(this.B, 2) + Math.pow(newB, 2)) / 2) - this.B) / this.values;
        this.values++;
    }

    getTraceColourHex() {
        const s = Math.min(this.R, this.G, this.B);
        if (s === this.R) return '#ff0000';
        if (s === this.G) return '#00ff00';
        return '#0000ff';
    }
    biggestRGBDifference() {
        return Math.max(this.R, this.G, this.B) - Math.min(this.R, this.G, this.B);
    }

    static getRGB(x, y) {
        const v = (y * imageData.width * 4) + (x * 4);
        return [imageData.data[v], // R
                imageData.data[v + 1], // G
                imageData.data[v + 2]]; // B
    }
}

class exportString {
    data = '';

    constructor(delim = "tab") {
        if (delim === "tab") {
            this.delim = "\t";
        } else {
            this.delim = " ";
        }
        this.data = `* Exported with UsyTrace, available at https://usyless.github.io/
* Freq(Hz)${this.delim}SPL(dB)`;
    }

    addData(freq, spl) {
        this.data += `
${freq.toString()}${this.delim}${spl.toString()}`
    }
}

function cleanUpData() {
    if (currentTrace.size > 2) {
        currentTrace = new Map([...currentTrace.entries()].sort((a, b) => a[0] - b[0]));
        simplifiedTrace = []
        let z, avg, n = currentTrace.entries().next().value[0], identity = [], finalKey, finalValue;
        simplifiedTrace.push([n, currentTrace.get(n)]);
        const l = imageData.width;
        for (let i = n + 1; i < l; i++) {
            z = currentTrace.get(i);
            if (z) {
                finalValue = z;
                identity = [];
                let j = i
                do {
                    finalKey = j;
                    identity.push(j);
                    j++;
                } while (currentTrace.get(j) === z)
                if (identity.length === 1) {
                    simplifiedTrace.push([i, z]);
                } else {
                    avg = identity.reduce((a, b) => a + b, 0) / identity.length;
                    simplifiedTrace.push([avg, z]);
                    i += identity.length - 1;
                }
            }
        }
        if (simplifiedTrace[simplifiedTrace.length - 1][0] !== finalKey) simplifiedTrace.push([finalKey, finalValue]);
    } else {
        simplifiedTrace = Array.from(currentTrace);
    }
}

function parseIntDefault(a, def) {
    let i = parseInt(a, 10);
    if (i) return i;
    return def;
}

function savePreviousTrace() {
    previousColour = traceColour;
    previousTrace = new Map(JSON.parse(JSON.stringify(Array.from(currentTrace))));
}

function contiguousLinearInterpolation(FRxSPL) {
    const firstF = FRxSPL[0][0],
        lastF = FRxSPL[FRxSPL.length - 1][0],
        firstV = FRxSPL[0][1],
        lastV = FRxSPL[FRxSPL.length - 1][1],
        l = FRxSPL.length;

    let i = 0;

    return (f) => {
        if (f <= firstF) return firstV;
        else if (f >= lastF) return lastV;
        else {
            let lower, upper;
            for (; i < l; i++) {
                if (FRxSPL[i][0] < f) lower = FRxSPL[i];
                else if (FRxSPL[i][0] > f) {
                    upper = FRxSPL[i];
                    i--;
                    break;
                }
            }
            if (lower[1] === upper[1]) return lower[1];
            return ((upper[1] - lower[1]) * ((f - lower[0]) / (upper[0] - lower[0]))) + lower[1];
        }
    }
}

function cleanDataSendTrace() {
    cleanUpData();
    postMessage({
        type: "done",
        trace: simplifiedTrace,
        colour: traceColour
    });
}

function clearTrace() {
    currentTrace.clear();
    simplifiedTrace = [];
    traceColour = '#ff0000';
}

function undoTrace() {
    currentTrace = new Map(JSON.parse(JSON.stringify(Array.from(previousTrace))));
    traceColour = previousColour;
    cleanDataSendTrace();
}

function exportTrace(data) {
    const lowFR = parseFloat(data['lowFR']),
        highFR = parseFloat(data['highFR']),
        FRPrecision = parseInt(data['FRPrecision'], 10),
        SPLPrecision = parseInt(data['SPLPrecision'], 10);

    // SPL Stuff
    const SPL = data['SPL'],
        SPLBot = parseFloat(SPL['bottom']),
        SPLBotPixel = parseFloat(SPL['bottomPixel']),
        // (top SPL value - bottom SPL value) / (top SPL pixel - bottom SPL pixel)
        SPLRatio = (parseFloat(SPL['top']) - SPLBot) / (parseFloat(SPL['topPixel']) - SPLBotPixel);

    // FR Stuff
    const FR = data['FR'],
        FRBotPixel = parseFloat(FR['bottomPixel']),
        logFRBot = Math.log10(parseFloat(FR['bottom'])),
        // (log10(top FR value) - log10(bottom FR value)) / (top FR pixel - bottom FR pixel)
        FRRatio = (Math.log10(parseFloat(FR['top'])) - logFRBot) / (parseFloat(FR['topPixel']) - FRBotPixel);

    const export_string = new exportString(data['delim']);

    const FRxSPL = simplifiedTrace.map(([x, y]) => [
        Math.pow(10, ((parseFloat(x) - FRBotPixel) * FRRatio) + logFRBot),
        ((parseFloat(y) - SPLBotPixel) * SPLRatio) + SPLBot]
    );

    const PPO = Math.log10(Math.pow(2, 1 / parseInt(data['PPO'], 10))),
        splFunc = contiguousLinearInterpolation(FRxSPL),
        h = Math.log10(highFR);
    for (let v = Math.log10(lowFR); ; v += PPO) {
        const freq = Math.pow(10, v);
        export_string.addData(freq.toFixed(FRPrecision), splFunc(freq).toFixed(SPLPrecision));
        if (v >= h) break;
    }

    postMessage({
        type: "export",
        export: export_string.data
    });
}

function addPoint(x, y) {
    savePreviousTrace();
    currentTrace.set(x, y);
    cleanDataSendTrace();
}

function autoTrace(data) {
    const w = imageData.width,
        max = Math.floor(imageData.height * 0.1),
        middle = Math.floor(imageData.height / 2),
        l = middle - max;
    let bestX, bestY, c, currentDiff = 0;
    for (let y = middle + max; y >= l; y--) {
        for (let x = 0; x < w; x++) {
            c = (new RGB(x, y, 0)).biggestRGBDifference();
            if (c > currentDiff) {
                bestX = x;
                bestY = y;
                currentDiff = c;
            }
        }
    }
    data['x'] = bestX;
    data['y'] = bestY;
    trace(data);
}

function trace(data) {
    savePreviousTrace();
    const x = parseInt(data['x'], 10), y = parseInt(data['y'], 10),
        maxLineHeight = Math.max(0, Math.floor(imageData.height * 0.05) + parseIntDefault(data['maxLineHeightOffset'], 0)),
        maxJump = Math.max(0, Math.floor(imageData.width * 0.02)) + parseIntDefault(data['maxJumpOffset'], 0),
        colour = new RGB(x, y, parseInt(data['colourTolerance'], 10)),
        w = imageData.width;
    trace(x, (x) => x >= 0, -1);
    trace(x + 1, (x) => x < w, 1);

    traceColour = colour.getTraceColourHex();
    cleanDataSendTrace();
    function trace(start, loop_func, step) {
        let n, m = 0, j = y, max;
        for (let i = start; loop_func(i); i += step) {
            colours = [];
            max = maxLineHeight + m;
            for (const [func, start] of funcs) {
                for (let z = start; z <= max; z++) {
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
}
