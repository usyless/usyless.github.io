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
            currentTrace.clear();
            simplifiedTrace = [];
            traceColour = '#ff0000';
            break;
        }
        case "undo": {
            currentTrace = new Map(JSON.parse(JSON.stringify(Array.from(previousTrace))));
            traceColour = previousColour;
            cleanDataSendTrace();
            break;
        }
        case "export": {
            const lowFR = parseFloat(e.data['lowFR']),
                highFR = parseFloat(e.data['highFR']),
                FRPrecision = parseInt(e.data['FRPrecision']),
                SPLPrecision = parseInt(e.data['SPLPrecision']);

            // SPL Stuff
            const SPL = e.data['SPL'],
                SPLBot = parseFloat(SPL['bottom']),
                SPLBotPixel = parseFloat(SPL['bottomPixel']),
            // (top SPL value - bottom SPL value) / (top SPL pixel - bottom SPL pixel)
                SPLRatio = (parseFloat(SPL['top']) - SPLBot) / (parseFloat(SPL['topPixel']) - SPLBotPixel);

            // FR Stuff
            const FR = e.data['FR'],
                FRBotPixel = parseFloat(FR['bottomPixel']),
                logFRBot = Math.log10(parseFloat(FR['bottom'])),
            // (log10(top FR value) - log10(bottom FR value)) / (top FR pixel - bottom FR pixel)
                FRRatio = (Math.log10(parseFloat(FR['top'])) - logFRBot) / (parseFloat(FR['topPixel']) - FRBotPixel);

            const export_string = new exportString(e.data['delim']);

            const FRxSPL = simplifiedTrace.map(([x, y]) => [
                Math.pow(10, ((parseFloat(x) - FRBotPixel) * FRRatio) + logFRBot),
                ((parseFloat(y) - SPLBotPixel) * SPLRatio) + SPLBot]
            );

            const PPO = Math.log10(Math.pow(2, 1 / parseInt(e.data['PPO'])));
            const splFunc = contiguousLinearInterpolation(FRxSPL);
            for (let v = Math.log10(lowFR);; v += PPO) {
                const freq = Math.pow(10, v);
                export_string.addData(freq.toFixed(FRPrecision), splFunc(freq).toFixed(SPLPrecision));
                if (v >= Math.log10(highFR)) break;
            }

            postMessage({
                type: "export",
                export: export_string.data
            });
            break;
        }
        case "point": {
            savePreviousTrace();
            currentTrace.set(parseInt(e.data['x']), parseInt(e.data['y']));
            cleanDataSendTrace();
            break;
        }
        case "setData": {
            imageData = e.data['imageData'];
            break;
        }
        case "trace": {
            savePreviousTrace();
            const x = parseInt(e.data['x']), y = parseInt(e.data['y']),
                maxLineHeight = Math.max(0, Math.floor(imageData.height * 0.05) + parseIntDefault(e.data['maxLineHeightOffset'], 0)),
                maxJump = Math.max(0, Math.floor(imageData.width * 0.02)) + parseIntDefault(e.data['maxJumpOffset'], 0),
                colour = new RGB(x, y, parseInt(e.data['colourTolerance']));

            trace(x, (x) => x >= 0, -1);
            trace(x + 1, (x) => x < imageData.width, 1);

            traceColour = colour.getTraceColourHex();
            cleanDataSendTrace();

            function trace(start, loop_func, step) {
                let n, m = 0, j = y;
                for (let i = start; loop_func(i); i += step) {
                    colours = [];
                    for (const [func, start] of funcs) {
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
        for (let i = n + 1; i < imageData.width; i++) {
            z = currentTrace.get(i);
            if (z) {
                finalValue = z;
                identity = [];
                for (let j = i; currentTrace.get(j) === z; j++) {
                    finalKey = j;
                    identity.push(j);
                }
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
    }
    else {
        simplifiedTrace = Array.from(currentTrace);
    }
}

function parseIntDefault(a, def) {
    let i = parseInt(a);
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
        lastV = FRxSPL[FRxSPL.length - 1][1];

    let i = 0;

    return (f) => {
        if (f <= firstF) return firstV;
        else if (f >= lastF) return lastV;
        else {
            let lower, upper;
            for (; i < FRxSPL.length; i++) {
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
