'use strict';

let imageData;
let currentTrace = new Map();
let simplifiedTrace = [];
let previousTrace = new Map();
let traceColour = '#ff0000';
let previousColour;

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
        case "snap": {
            snap(e.data);
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
        const [newR, newG, newB] = RGB.getRGB(x, y),
            rmean = (this.R + newR) / 2,
            r = this.R - newR, g = this.G - newG, b = this.B - newB;
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
    static biggestRGBDifference(x, y) {
        const [R, G, B] = RGB.getRGB(x, y);
        return Math.max(R, G, B) - Math.min(R, G, B);
    }

    static getRGB(x, y) {
        const v = (y * imageData.width * 4) + (x * 4);
        return [imageData.data[v], // R
                imageData.data[v + 1], // G
                imageData.data[v + 2]]; // B
    }

    static getGrayscale(x, y) {
        const [R, G, B] = RGB.getRGB(x, y);
        return (R + G + B) / 3;
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

function autoTrace(data) { // calculate based on difference to background, bigger difference = more likely maybe?
    const h = imageData.height, maxYRange = Math.floor(h * 0.35),
        middleY = Math.floor(h / 2), yCond = middleY - maxYRange,
        middleX = Math.floor(imageData.width / 2);
    let bestY, c, currentDiff = 0;
    for (let y = middleY + maxYRange; y > yCond; y--) {
        c = RGB.biggestRGBDifference(middleX, y);
        if (c > currentDiff) {
            bestY = y;
            currentDiff = c;
        }
    }
    data['x'] = middleX;
    data['y'] = bestY;
    trace(data);
}

function trace(data) {
    savePreviousTrace();
    const x = parseInt(data['x'], 10), y = parseInt(data['y'], 10), w = imageData.width, h = imageData.height,
        maxLineHeight = Math.max(0, Math.floor(h * 0.05) + parseIntDefault(data['maxLineHeightOffset'], 0)),
        maxJump = Math.max(0, Math.floor(w * 0.02)) + parseIntDefault(data['maxJumpOffset'], 0),
        colour = new RGB(x, y, parseInt(data['colourTolerance'], 10));
    trace(x, -1);
    trace(x + 1, 1);

    traceColour = colour.getTraceColourHex();
    cleanDataSendTrace();
    function trace(start, step) {
        let n, m = 0, j = y, max, colours;
        for (; start >= 0 && start < w; start += step) {
            colours = [];
            max = maxLineHeight + m*2;
            checkPixel(start, j);
            for (let z = 1; z <= max; z++) {
                checkPixel(start, j + z);
                checkPixel(start, j - z);
            }
            if (colours.length > 0) {
                m = 0;
                for (const c of colours) {
                    m += c;
                    colour.addToAverage(start, c);
                }
                j = Math.floor(m / colours.length);
                m = 0;
                currentTrace.set(start, j);
                continue;
            }
            if (m < maxJump) m++;
            else break;
        }

        function checkPixel(x, y) {
            n = Math.max(0, Math.min(h - 1, y));
            if (colour.withinTolerance(x, n)) colours.push(n);
        }
    }
}

function snap(data) {
    const line = data['line'], pos = Math.floor(line.pos),
        imgAvg = RGB.getGrayscale(0, 0), valid = [];
    let s = imageData.height, z = imageData.width, direction = parseInt(data['dir']), func = (x, y) => [x, y];
    if (line.dir === "y") {
        s = imageData.width;
        z = imageData.height;
        func = (x, y) => [y, x]
    }

    const lower = Math.floor(s * 0.2), upper = Math.floor(s * 0.8),
        jump = Math.floor(z * 0.01);

    customFor(pos + (jump * direction), z, direction, lower, upper, upper - lower, func);

    if (valid.length > 0) {
        let sum = 0;
        for (const v of valid) sum += v;
        line.pos = sum / valid.length;
        postMessage({
            type: 'snap',
            line: line
        });
    }

    function customFor(start, max, direction, lower, upper, total, func) {
        for (let i = start; i < max && i >= 0; i += direction) {
            if (lineColourInTolerance(i, lower, upper, total, func)) valid.push(i);
            else if (valid.length > 0) break;
        }
    }

    function lineColourInTolerance(pos, lowerBound, upperBound, total, func) {
        let trueCount = 0;
        for (let j = upperBound; j > lowerBound; j--) {
            if (Math.abs(RGB.getGrayscale(...func(pos, j)) - imgAvg) > 10) trueCount++;
        }
        if (trueCount >= 0.95 * total) return true;
    }
}