'use strict';

const state = State();

const trace_canvas = document.getElementById('traceCanvas');
const trace_ctx = trace_canvas.getContext('2d');

const defaults = {
    "colourTolerance": 50,
    "maxLineHeightOffset": 0,
    "maxJumpOffset": 0,

    "PPO": 48,
    "delimitation": "tab",
    "lowFRExport": 20,
    "highFRExport": 20000,
    "exportSPLPrecision": 3,
    "exportFRPrecision": 5,

    "moveSpeedOffset": 0,

    "SPLTop": "",
    "SPLBot": "",
    "FRTop": "",
    "FRBot": ""
}

let worker, hLineMoveSpeed, vLineMoveSpeed, freqLines, splLines, sizeRatio, lineWidth;
restoreDefault();

function State() {
    function createWorker() {
        if (!worker) {
            clearPath();
            worker = new Worker("./worker.js");
            worker.onmessage = (e) => {
                if (e.data['type'] === "done") {
                    const traceData = e.data['trace'];
                    if (traceData.size > 1) {
                        const first = traceData.entries().next().value;
                        beginPlot(first[0], first[1], e.data['colour']);
                        for (const [x, y] of traceData) plotLine(x, y);
                    }
                    state.toggleTrace();
                } else {
                    let a = document.createElement("a");
                    let url = URL.createObjectURL(new Blob([e.data['export']], {type: "text/plain;charset=utf-8"}));
                    a.href = url;
                    a.download = "trace.txt";
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 0);
                }
            }
        }
    }

    function multiEventListener(events, target, callback) {
        if (typeof (events) !== "object") events = [events];
        events.forEach((ev) => target.addEventListener(ev, callback));
    }

    class State {
        States = {
            initial: 0,
            imageLoaded: 1,
            selectingPath: 2,
            selectingPoint: 3
        }
        state = this.States.initial;
        newImage = true;
        firstLoad = true;
        pathButton = document.getElementById('selectPath');
        pointButton = document.getElementById('selectPoint');
        buttons = [this.pathButton, this.pointButton];
        image = document.getElementById('uploadedImage');
        canvas = document.getElementById('lineCanvas');
        imageInput = document.getElementById('imageInputDiv');
        fileInput = document.getElementById('imageInput');
        main = document.getElementById('main');
        overlay = document.getElementById('overlay');

        constructor() {
            multiEventListener('dragstart', this.image, (e) => e.preventDefault());
            multiEventListener('click', this.imageInput, () => this.fileInput.click());
            multiEventListener('click', document.getElementById("restoreDefault"), () => restoreDefault());
            multiEventListener('click', this.pathButton, () => this.togglePath());
            multiEventListener('click', this.pointButton, () => this.togglePoint());
            multiEventListener('change', this.fileInput, () => this.loadNewImage());
            multiEventListener('dragover', this.main, (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy';
                this.main.classList.add('lowOpacity');
            });
            multiEventListener(['dragleave', 'dragend'], this.main, (e) => {
                e.preventDefault();
                this.main.classList.remove('lowOpacity');
            });
            multiEventListener('drop', this.main, (e) => {
                e.preventDefault();
                this.main.style.opacity = "1";
                this.fileInput.files = e.dataTransfer.files;
                let event = new Event('change');
                this.fileInput.dispatchEvent(event);
            });
            multiEventListener('load', this.image, () => {
                document.querySelectorAll("[temp_thing='true']").forEach(e => e.remove());
                document.querySelectorAll("button[class='disableme']").forEach(b => b.disabled = false);

                document.querySelectorAll("canvas").forEach(canvas => {
                    canvas.width = this.image.naturalWidth;
                    canvas.height = this.image.naturalHeight;
                });
                updateSizeRatio();
                updateLineWidth();
                updateLineMoveSpeed();

                const canvas = this.canvas;
                const context = canvas.getContext('2d');
                context.fillStyle = '#ff0000';

                freqLines = [
                    {pos: canvas.width * 0.1, type: "Low", x: "hello"},
                    {pos: canvas.width * 0.9, type: "High", x: "hello"}
                ];
                splLines = [
                    {pos: canvas.height * 0.1, type: "High"},
                    {pos: canvas.height * 0.9, type: "Low"}
                ];

                function drawLines() {
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.font = `${1.3 * sizeRatio}rem arial`
                    context.lineWidth = sizeRatio;

                    freqLines.forEach(line => {
                        context.strokeStyle = 'green';
                        context.beginPath();
                        line.pos = Math.floor(Math.max(canvas.width * 0.02, Math.min(canvas.width * 0.98, line.pos)));
                        context.moveTo(line.pos, 0);
                        context.lineTo(line.pos, canvas.height);
                        context.stroke();
                        context.fillText(line.type, line.pos + 5, canvas.height * 0.5);
                    });
                    splLines.forEach(line => {
                        context.strokeStyle = 'blue';
                        context.beginPath();
                        line.pos = Math.floor(Math.max(canvas.height * 0.02, Math.min(canvas.height * 0.98, line.pos)));
                        context.moveTo(0, line.pos);
                        context.lineTo(canvas.width, line.pos);
                        context.stroke();
                        context.fillText(line.type, canvas.width * 0.5, line.pos - 5);
                    });
                }

                if (this.firstLoad) {
                    multiEventListener('resize', window, () => {
                        updateSizeRatio();
                        drawLines();
                    });

                    let selectedLine = null;
                    let offset = 0;

                    multiEventListener('mousedown', canvas, (e) => {
                        let mouse = e.clientX - canvas.getBoundingClientRect().left;
                        let xTolerance = canvas.width * 0.02;
                        let yTolerance = canvas.height * 0.02;

                        for (let line of freqLines) {
                            if (Math.abs(mouse * sizeRatio - line.pos) < xTolerance) {
                                selectedLine = line;
                                offset = mouse * sizeRatio - line.pos;
                                return;
                            }
                        }

                        mouse = e.clientY - canvas.getBoundingClientRect().top;
                        for (let line of splLines) {
                            if (Math.abs(mouse * sizeRatio - line.pos) < yTolerance) {
                                selectedLine = line;
                                offset = mouse * sizeRatio - line.pos;
                                return;
                            }
                        }
                    });

                    multiEventListener('mousemove', canvas, (e) => {
                        if (selectedLine) {
                            let rect = canvas.getBoundingClientRect();
                            if (selectedLine.x) {
                                let mouse = e.clientX - rect.left;
                                selectedLine.pos = Math.floor(mouse * sizeRatio - offset);
                                drawLines();
                            } else if (selectedLine.pos) {
                                let mouse = e.clientY - rect.top;
                                selectedLine.pos = Math.floor(mouse * sizeRatio - offset);
                                drawLines();
                            }
                        }
                    });

                    multiEventListener(['mouseup', 'mouseleave', 'mouseout'], canvas, (e) => {
                        e.preventDefault();
                        selectedLine = null;
                    });

                    function moveLine(line, button) {
                        if (line.x) line.pos += hLineMoveSpeed * button.getAttribute("dir");
                        else line.pos += vLineMoveSpeed * button.getAttribute("dir");
                        drawLines();
                    }

                    let holdInterval;

                    document.querySelectorAll("button[move='true']").forEach((btn) => {
                        multiEventListener(['mousedown', 'touchstart'], btn, (e) => {
                            e.preventDefault();
                            holdInterval = setInterval(() => {
                                switch (e.target.getAttribute('btn-name')) {
                                    case 'spltop': {
                                        moveLine(splLines[0], e.target);
                                        break;
                                    }
                                    case 'splbot': {
                                        moveLine(splLines[1], e.target);
                                        break;
                                    }
                                    case 'frtop': {
                                        moveLine(freqLines[1], e.target);
                                        break;
                                    }
                                    case 'frbot': {
                                        moveLine(freqLines[0], e.target);
                                        break;
                                    }
                                }
                            }, 50);
                        });

                        multiEventListener(['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'], btn, (e) => {
                            e.preventDefault();
                            clearInterval(holdInterval);
                        });
                    });

                    multiEventListener('click', this.image, (e) => {
                        const rect = this.image.getBoundingClientRect();
                        let x = e.clientX - rect.left;
                        let y = e.clientY - rect.top;

                        x *= sizeRatio;
                        y *= sizeRatio;

                        createWorker();

                        if (this.newImage) {
                            const processing_canvas = document.createElement("canvas");
                            const processing_context = processing_canvas.getContext('2d');
                            processing_canvas.width = this.image.naturalWidth;
                            processing_canvas.height = this.image.naturalHeight;

                            const image = new Image;
                            image.src = this.image.src;
                            processing_context.drawImage(image, 0, 0);

                            this.newImage = false;
                            worker.postMessage({
                                type: 'setData',
                                imageData: processing_context.getImageData(0, 0, image.width, image.height)
                            });
                        }

                        if (this.checkState(this.States.selectingPath)) {
                            this.toggleTrace();
                            worker.postMessage({
                                type: 'trace',
                                x: x,
                                y: y,
                                lineHeightOffset: document.getElementById("maxLineHeightOffset").value,
                                colourTolerance: document.getElementById("colourTolerance").value,
                                maxJumpOffset: document.getElementById("maxJumpOffset").value
                            });
                        } else {
                            this.toggleTrace();
                            worker.postMessage({
                                type: 'point',
                                x: x,
                                y: y
                            });
                        }
                    });
                    this.firstLoad = false;
                }
                drawLines();
            });

            document.querySelectorAll("button[class='disableme']").forEach(b => b.disabled = true);
        }

        updateState(newState) {
            this.state = newState;
        }

        checkState(states) {
            if (typeof (states) !== "object") states = [states];
            for (let s of states) if (s === this.state) return true;
            return false;
        }

        startImageEditing() {
            this.image.classList.add("crosshair_hover");
            this.image.classList.remove("removePointerEvents");
            this.canvas.classList.add("removePointerEvents");
            this.canvas.classList.add("hidden");
        }

        stopImageEditing() {
            this.image.classList.remove("crosshair_hover");
            this.image.classList.add("removePointerEvents");
            this.canvas.classList.remove("removePointerEvents");
            this.canvas.classList.remove("hidden");
        }

        buttonsToDefault() {
            this.buttons.forEach(btn => {
                btn.disabled = false;
                btn.innerText = btn.getAttribute("def");
            });
        }

        loadNewImage() {
            this.newImage = true;
            this.buttonsToDefault();
            this.stopImageEditing();
            this.image.src = URL.createObjectURL(document.getElementById('imageInput').files[0]);
            this.updateState(this.States.imageLoaded);
            clearPath();
        }

        togglePath() {
            this.buttonsToDefault();
            if (this.checkState([this.States.imageLoaded, this.States.selectingPoint])) {
                this.startImageEditing();
                this.pathButton.innerText = this.pathButton.getAttribute("alt");
                this.updateState(this.States.selectingPath);
            } else if (this.checkState(this.States.selectingPath)) {
                this.stopImageEditing();
                this.updateState(this.States.imageLoaded);
            }
        }

        togglePoint() {
            this.buttonsToDefault();
            if (this.checkState([this.States.imageLoaded, this.States.selectingPath])) {
                this.startImageEditing();
                this.pointButton.innerText = this.pointButton.getAttribute("alt");
                this.updateState(this.States.selectingPoint);
            } else if (this.checkState(this.States.selectingPoint)) {
                this.stopImageEditing();
                this.updateState(this.States.imageLoaded);
            }
        }

        toggleTrace() {
            this.overlay.classList.toggle("hidden");
            this.main.classList.toggle("lowOpacity");
            this.main.classList.toggle("not_allowed");
            this.main.classList.toggle("removePointerEvents");
        }
    }

    return new State();
}

function beginPlot(beginX, beginY, colour = '#ff0000') {
    clearPath("lmfao");
    trace_ctx.beginPath();
    trace_ctx.moveTo(beginX, beginY);
    trace_ctx.strokeStyle = colour;
}

function plotLine(toX, toY) {
    trace_ctx.lineWidth = lineWidth;
    trace_ctx.lineTo(toX, toY);
    trace_ctx.stroke();
}

function clearPath(no) { // put in a random string to not post to worker
    trace_ctx.clearRect(0, 0, trace_canvas.width, trace_canvas.height);
    trace_ctx.beginPath();
    if (worker && !no) worker.postMessage({type: "clear"});
}

function exportTrace() {
    let SPLTop = document.getElementById("SPLTop").value;
    let SPLBot = document.getElementById("SPLBot").value;
    let FRTop = document.getElementById("FRTop").value;
    let FRBot = document.getElementById("FRBot").value;

    if (!SPLTop || !SPLBot || !FRTop || !FRBot) {
        let btn = document.getElementById("export");
        btn.innerText = "Please Fill in All Values Below (Export Trace)";
        setTimeout(() => btn.innerText = "Export Trace", 5000);
        return;
    }

    worker.postMessage({
        type: "export",
        SPL: {
            top: SPLTop,
            topPixel: splLines[0].pos,
            bottom: SPLBot,
            bottomPixel: splLines[1].pos
        },
        FR: {
            top: FRTop,
            topPixel: freqLines[1].pos,
            bottom: FRBot,
            bottomPixel: freqLines[0].pos,
        },
        lowFR: document.getElementById("lowFRExport").value,
        highFR: document.getElementById("highFRExport").value,
        FRPrecision: document.getElementById("exportFRPrecision").value,
        SPLPrecision: document.getElementById("exportSPLPrecision").value,
        PPO: document.getElementById("PPO").value,
        delim: document.getElementById("delimitation").value
    });
}

function minVal(e) {
    if (e.value < e.min) e.value = e.min;
}

function undo() {
    if (worker) {
        state.toggleTrace();
        worker.postMessage({type: "undo"});
    }
}

function restoreDefault() {
    for (const val in defaults) {
        document.getElementById(val).value = defaults[val];
    }
}

function updateLineMoveSpeed() {
    hLineMoveSpeed = Math.max(1, parseInt(document.getElementById("moveSpeedOffset").value) + Math.floor(trace_canvas.width * 0.004));
    vLineMoveSpeed = Math.max(1, parseInt(document.getElementById("moveSpeedOffset").value) + Math.floor(trace_canvas.height * 0.004));
}

function updateSizeRatio() {
    sizeRatio = trace_canvas.width / trace_canvas.clientWidth;
}

function updateLineWidth() {
    lineWidth = trace_canvas.height * 0.004;
}
