const state = State();

const trace_canvas = document.getElementById('traceCanvas');
const trace_ctx = trace_canvas.getContext('2d');

const defaults = {
    "colourTolerance": 50,
    "maxLineHeightOffset": 0,
    "maxJumpOffset": 0,

    "lineColour": "#ff0000",

    "lowFRExport": 20,
    "highFRExport": 20000,
    "exportSPLPrecision": 3,
    "exportFRPrecision": 5,

    "moveSpeed": 2,

    "SPLTop": "",
    "SPLBot": "",
    "FRTop": "",
    "FRBot": ""
}

let worker, lineMoveSpeed, xLines, yLines, newImage = true, sizeRatio, lineWidth;
updateLineMoveSpeed();
restoreDefault();

function State() {
    class State {
        States = {
            initial: 0,
            imageLoaded: 1,
            selectingPath: 2,
            selectingPoint: 3,
            tracing: 4,
        }
        state = this.States.initial;
        previousState = null;
        pathButton = document.getElementById("selectPath");
        pointButton = document.getElementById("selectPoint");
        buttons = [this.pathButton, this.pointButton];
        image = document.getElementById('uploadedImage');
        canvas = document.getElementById('lineCanvas');
        imageInput = document.getElementById("imageInputDiv");
        imageInputEvent = () => document.getElementById("imageInput").click();

        constructor() {
            this.imageInput.addEventListener("click", this.imageInputEvent);
            document.getElementById("restoreDefault").addEventListener("click", () => restoreDefault());
            document.querySelectorAll("button[class='disableme']").forEach(b => b.disabled = true);

            this.pathButton.addEventListener('click', () => this.togglePath());
            this.pointButton.addEventListener('click', () => this.togglePoint());
            this.image.addEventListener('load', () => {
                document.querySelectorAll("[temp_thing='true']").forEach(e => e.remove());
                document.querySelectorAll("button[class='disableme']").forEach(b => b.disabled = false);

                document.querySelectorAll("canvas").forEach(canvas => {
                    canvas.width = this.image.naturalWidth;
                    canvas.height = this.image.naturalHeight;
                });
                updateSizeRatio();
                updateLineWidth();

                {
                    const canvas = this.canvas;
                    const context = canvas.getContext('2d');
                    xLines = [
                        {pos: canvas.width * 0.1, type: "Low", x: "hello"},
                        {pos: canvas.width * 0.9, type: "High", x: "hello"}
                    ];
                    yLines = [
                        {pos: canvas.height * 0.1, type: "High"},
                        {pos: canvas.height * 0.9, type: "Low"}
                    ];

                    function drawLines() {
                        context.clearRect(0, 0, canvas.width, canvas.height);
                        context.font = `${1.3 * sizeRatio}rem arial`
                        context.fillStyle = '#ff0000';
                        context.lineWidth = sizeRatio;

                        xLines.forEach(line => {
                            context.strokeStyle = 'green';
                            context.beginPath();
                            line.pos = Math.floor(Math.max(canvas.width * 0.02, Math.min(canvas.width * 0.98, line.pos)));
                            context.moveTo(line.pos, 0);
                            context.lineTo(line.pos, canvas.height);
                            context.stroke();
                            context.fillText(line.type, line.pos + 5, canvas.height * 0.5);
                        });
                        yLines.forEach(line => {
                            context.strokeStyle = 'blue';
                            context.beginPath();
                            line.pos = Math.floor(Math.max(canvas.height * 0.02, Math.min(canvas.height * 0.98, line.pos)));
                            context.moveTo(0, line.pos);
                            context.lineTo(canvas.width, line.pos);
                            context.stroke();
                            context.fillText(line.type, canvas.width * 0.5, line.pos - 5);
                        });
                    }

                    window.addEventListener('resize', () => {
                        updateSizeRatio();
                        drawLines();
                    });

                    let selectedLine = null;
                    let offset = 0;

                    canvas.addEventListener('mousedown', e => {
                        let mouse = e.clientX - canvas.getBoundingClientRect().left;
                        let xTolerance = canvas.width * 0.02;
                        let yTolerance = canvas.height * 0.02;

                        for (let line of xLines) {
                            if (Math.abs(mouse * sizeRatio - line.pos) < xTolerance) {
                                selectedLine = line;
                                offset = mouse * sizeRatio - line.pos;
                                return;
                            }
                        }

                        mouse = e.clientY - canvas.getBoundingClientRect().top;
                        for (let line of yLines) {
                            if (Math.abs(mouse * sizeRatio - line.pos) < yTolerance) {
                                selectedLine = line;
                                offset = mouse * sizeRatio - line.pos;
                                return;
                            }
                        }
                    });

                    canvas.addEventListener('mousemove', e => {
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

                    ['mouseup', 'mouseleave', 'mouseout'].forEach(ev => canvas.addEventListener(ev, e => {
                        e.preventDefault();
                        selectedLine = null;
                    }));

                    function moveLine(line, button) {
                        if (button.getAttribute('btn-dir') === 'up') line.pos -= lineMoveSpeed;
                        else line.pos += lineMoveSpeed;
                        drawLines();
                    }

                    let holdInterval;

                    document.querySelectorAll("button[move='true']").forEach(btn => {
                        ['mousedown', 'touchstart'].forEach(ev => {
                            btn.addEventListener(ev, e => {
                                e.preventDefault();
                                holdInterval = setInterval(() => {
                                    switch (e.target.getAttribute('btn-name')) {
                                        case 'spltop': {
                                            moveLine(yLines[0], e.target);
                                            break;
                                        }
                                        case 'splbot': {
                                            moveLine(yLines[1], e.target);
                                            break;
                                        }
                                        case 'frtop': {
                                            moveLine(xLines[1], e.target);
                                            break;
                                        }
                                        case 'frbot': {
                                            moveLine(xLines[0], e.target);
                                            break;
                                        }
                                    }
                                }, 50);
                            });
                        });
                        ['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'].forEach(ev => btn.addEventListener(ev, e => {
                            e.preventDefault();
                            clearInterval(holdInterval);
                        }));
                    });

                    drawLines();
                }

                this.image.addEventListener('click', e => {
                    const rect = this.image.getBoundingClientRect();
                    let x = e.clientX - rect.left;
                    let y = e.clientY - rect.top;

                    x *= sizeRatio;
                    y *= sizeRatio;

                    createWorker();

                    if (newImage) {
                        const processing_canvas = document.createElement("canvas");
                        const processing_context = processing_canvas.getContext('2d');
                        processing_canvas.width = this.image.naturalWidth;
                        processing_canvas.height = this.image.naturalHeight;

                        const image = new Image;
                        image.src = this.image.src;
                        processing_context.drawImage(image, 0, 0);

                        newImage = false;
                        worker.postMessage(["setData", processing_context.getImageData(0, 0, image.width, image.height)]);
                    }

                    if (this.checkState(this.States.selectingPath)) {
                        this.toggleTrace();
                        worker.postMessage([
                            "trace", x, y,
                            document.getElementById("maxLineHeightOffset").value,
                            document.getElementById("colourTolerance").value,
                            document.getElementById("maxJumpOffset").value,
                        ]);
                    } else {
                        this.toggleTrace();
                        worker.postMessage(["point", x, y]);
                    }
                });
            });
        }

        updateState(newState) {
            this.state = newState;
        }

        checkState(states) {
            if (typeof (states) !== "object") states = [states];
            for (let s of states) if (s === this.state) return true;
            return false;
        }

        toggleImageInput() {
            if (this.imageInput.classList.toggle("disabled")) this.imageInput.removeEventListener("click", this.imageInputEvent);
            else this.imageInput.addEventListener("click", this.imageInputEvent);
        }

        startImageEditing() {
            this.image.classList.add("crosshair_hover");
            this.image.classList.remove("removePointerEvents");
            this.canvas.classList.add("removePointerEvents");
            this.canvas.style.display = "none";
        }

        stopImageEditing() {
            this.image.classList.remove("crosshair_hover");
            this.image.classList.add("removePointerEvents");
            this.canvas.classList.remove("removePointerEvents");
            this.canvas.style.display = "block";
        }

        buttonsToDefault() {
            this.buttons.forEach(btn => {
                btn.disabled = false;
                btn.innerText = btn.getAttribute("def");
            });
        }

        newImage() {
            newImage = true;
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
            if (this.checkState([this.States.selectingPath, this.States.selectingPoint])) {
                this.toggleImageInput();
                this.image.classList.remove("crosshair_hover");
                this.image.classList.add("removePointerEvents");
                this.buttons.forEach(btn => {
                    btn.disabled = true;
                    btn.innerText = "Tracing in progress";
                });
                this.previousState = this.state;
                this.updateState(this.States.tracing);
            } else if (this.checkState(this.States.tracing)) {
                this.toggleImageInput();
                this.buttonsToDefault();
                this.updateState(this.States.imageLoaded);
                if (this.previousState === this.States.selectingPath) this.togglePath();
                else this.togglePoint();
            }
        }
    }

    return new State();
}

function displayImage() {
    state.newImage();
}

function beginPlot(beginX, beginY) {
    clearPath("lmfao");
    trace_ctx.beginPath();
    trace_ctx.moveTo(beginX, beginY);
}

function plotLine(toX, toY) {
    trace_ctx.strokeStyle = document.getElementById("lineColour").value;
    trace_ctx.lineWidth = lineWidth;
    trace_ctx.lineTo(toX, toY);
    trace_ctx.stroke();
}

function clearPath(no) { // put in a random string to not post to worker
    trace_ctx.clearRect(0, 0, trace_canvas.width, trace_canvas.height);
    trace_ctx.beginPath();
    if (worker && !no) worker.postMessage(["clear"]);
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

    worker.postMessage(["export",
        [SPLTop, parseInt(yLines[0].pos)],
        [SPLBot, parseInt(yLines[1].pos)],
        [FRTop, parseInt(xLines[1].pos)],
        [FRBot, parseInt(xLines[0].pos)],
        document.getElementById("lowFRExport").value,
        document.getElementById("highFRExport").value,
        document.getElementById("exportFRPrecision").value,
        document.getElementById("exportSPLPrecision").value
    ]);
}

function download(data) {
    let file = new Blob([data], {type: "text/plain;charset=utf-8"});
    let a = document.createElement("a");
    let url = URL.createObjectURL(file);
    a.href = url;
    a.download = "trace.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

function minVal(e) {
    if (e.value < e.min) e.value = e.min;
}

function undo() {
    if (worker) {
        state.toggleTrace();
        worker.postMessage(["undo"]);
    }
}

function updateLine() {
    if (worker) {
        state.toggleTrace();
        worker.postMessage(["get"]);
    }
}

function restoreDefault() {
    for (let val in defaults) {
        document.getElementById(val).value = defaults[val];
    }
    updateLine();
}

function updateLineMoveSpeed() {
    lineMoveSpeed = parseInt(document.getElementById("moveSpeed").value);
}

function updateSizeRatio() {
    sizeRatio = trace_canvas.width / trace_canvas.clientWidth;
}

function updateLineWidth() {
    lineWidth = trace_canvas.height * 0.004;
}

function createWorker() {
    if (!worker) {
        clearPath();
        worker = new Worker("./worker.js");
        worker.onmessage = (e) => {
            if (e.data[0] === "done") {
                const traceData = e.data[1];
                const first = traceData.entries().next().value;
                beginPlot(first[0], first[1]);
                traceData.forEach((y, x) => plotLine(x, y));
                state.toggleTrace();
            } else {
                download(e.data[1]);
            }
        }
    }
}