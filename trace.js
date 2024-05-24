let state = "Initial";

const trace_canvas = document.getElementById('traceCanvas');
const trace_ctx = trace_canvas.getContext('2d');

const all_canvases = document.querySelectorAll("canvas");

let lineMoveSpeed = parseInt(document.getElementById("moveSpeed").value);

document.querySelector("div[class*='divButton']").addEventListener("click", () => document.getElementById("imageInput").click());
document.getElementById("restoreDefault").addEventListener("click", () => restoreDefault());
document.querySelectorAll("button[class='disableme']").forEach(b => b.disabled = true);

const defaults = {
    "tolerance": 50,
    "maxLineHeight": 25,
    "maxJump": 15,
    "lineColour": "#ff0000",
    "lineThickness": 3,
    "lowFRExport": 20,
    "highFRExport": 20000,
    "exportSPLPrecision": 3,
    "exportFRPrecision": 5,
    "moveSpeed": 2
}

let worker;

let newImage = true;

let xLines, yLines;

function displayImage() {
    newImage = true;
    if (state === "Selecting") switchState();
    clearPath();
    let input = document.getElementById('imageInput');
    let img = document.getElementById('uploadedImage');

    img.src = URL.createObjectURL(input.files[0]);
    img.onload = () => {
        document.querySelectorAll("[temp_thing='true']").forEach(e => e.remove());
        document.querySelectorAll("button[class='disableme']").forEach(b => b.disabled = false);
        state = "ImageLoaded";

        all_canvases.forEach(canvas => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
        });

        {
            const canvas = document.getElementById('lineCanvas');
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
                context.font = "16px arial"

                xLines.forEach(line => {
                    context.strokeStyle = 'green';
                    context.beginPath();
                    context.moveTo(line.pos, 0);
                    context.lineTo(line.pos, canvas.height);
                    context.stroke();
                    context.fillText(line.type, line.pos + 5, canvas.height * 0.5);
                });
                yLines.forEach(line => {
                    context.strokeStyle = 'blue';
                    context.beginPath();
                    context.moveTo(0, line.pos);
                    context.lineTo(canvas.width, line.pos);
                    context.stroke();
                    context.fillText(line.type, canvas.width * 0.5, line.pos - 5);
                });
            }

            let selectedLine = null;
            let offset = 0;
            let ratio = 1;

            canvas.addEventListener('mousedown', (e) => {
                let mouse = e.clientX - canvas.getBoundingClientRect().left;
                ratio = img.naturalWidth / img.clientWidth;

                for (let line of xLines) {
                    if (Math.abs(mouse * ratio - line.pos) < 10) {
                        selectedLine = line;
                        offset = mouse * ratio - line.pos;
                        return;
                    }
                }

                mouse = e.clientY - canvas.getBoundingClientRect().top;
                for (let line of yLines) {
                    if (Math.abs(mouse * ratio - line.pos) < 10) {
                        selectedLine = line;
                        offset = mouse * ratio - line.pos;
                        return;
                    }
                }
            });

            canvas.addEventListener('mousemove', (e) => {
                if (selectedLine) {
                    if(selectedLine.x) {
                        let mouse = e.clientX - canvas.getBoundingClientRect().left;
                        selectedLine.pos = parseInt(Math.max(canvas.width * 0.02, Math.min(canvas.width * 0.98, mouse * ratio - offset)));
                        drawLines();
                    } else if (selectedLine.pos) {
                        let mouse = e.clientY - canvas.getBoundingClientRect().top;
                        selectedLine.pos = parseInt(Math.max(canvas.height * 0.02, Math.min(canvas.height * 0.98, mouse * ratio - offset)));
                        drawLines();
                    }
                }
            });
            
            function moveLine(line, button) {
                if (button.getAttribute('btn-dir') === 'up') line.pos -= lineMoveSpeed;
                else line.pos += lineMoveSpeed;
                drawLines();
            }

            let holdInterval;

            document.querySelectorAll("button[move='true']").forEach(btn => {
                ['mousedown', 'touchstart'].forEach(ev => {
                    btn.addEventListener(ev, e => {
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
                ['mouseup', 'mouseleave', 'mouseout', 'touchend', 'touchcancel'].forEach(e => btn.addEventListener(e, () => clearInterval(holdInterval)));
            })

            canvas.addEventListener('mouseup', () => {
                selectedLine = null;
            });

            drawLines();
        }

        img.onclick = (e) => {
            if (state === "Selecting") {
                const rect = img.getBoundingClientRect();
                let x = e.clientX - rect.left;
                let y = e.clientY - rect.top;

                const ratio = img.naturalWidth / img.clientWidth;
                x *= ratio;
                y *= ratio;

                let imageData = null;
                if (newImage) {
                    const processing_canvas = document.createElement("canvas");

                    const processing_context = processing_canvas.getContext('2d');
                    processing_canvas.width = img.naturalWidth;
                    processing_canvas.height = img.naturalHeight;

                    const image = new Image;
                    image.src = img.src;
                    processing_context.drawImage(image, 0, 0);

                    imageData = processing_context.getImageData(0, 0, image.width, image.height);
                    newImage = false;
                }

                if (!worker) {
                    clearPath();
                    worker = new Worker("./worker.js");
                    worker.onmessage = (e) => {
                        if (e.data[0] === "done") {
                            const traceData = e.data[1];
                            const first = traceData.entries().next().value;
                            beginPlot(first[0], first[1]);
                            traceData.forEach((y, x) => plotLine(x, y));
                            state = "TracingDone";
                            switchState();
                        } else {
                            download(e.data[1]);
                        }
                    }
                }

                worker.postMessage([
                    imageData, x, y,
                    document.getElementById("maxLineHeight").value,
                    document.getElementById("tolerance").value,
                    document.getElementById("maxJump").value,
                ]);

                state = "Tracing";
                switchState();
            }
        }
    }
}

function switchState(e) {
    if (!e) e = document.getElementById("pth");
    switch (state) {
        case "ImageLoaded": { // switch to selecting state
            const image = document.getElementById('uploadedImage');
            image.classList.add("crosshair_hover");
            image.classList.remove("removePointerEvents");
            const canvas = document.getElementById('lineCanvas');
            canvas.classList.add("removePointerEvents");
            canvas.style.display = "none";
            state = "Selecting";
            e.innerText = "Stop Selecting";
            break;
        }
        case "Selecting": { // switch to image loaded state
            const image = document.getElementById('uploadedImage');
            image.classList.remove("crosshair_hover");
            image.classList.add("removePointerEvents");
            const canvas = document.getElementById('lineCanvas');
            canvas.classList.remove("removePointerEvents");
            canvas.style.display = "block";
            state = "ImageLoaded";
            e.innerText = "Select Path";
            break;
        }
        case "Tracing": {
            const imagePicker = document.querySelector("div[class*='divButton']");
            imagePicker.removeEventListener("click", () => document.getElementById("imageInput").click());
            imagePicker.classList.add("disabled");
            const image = document.getElementById('uploadedImage');
            image.classList.remove("crosshair_hover");
            image.classList.add("removePointerEvents");
            e.innerText = "Tracing in progress";
            e.disabled = true;
            break;
        }
        case "TracingDone": {
            const imagePicker = document.querySelector("div[class*='divButton']");
            imagePicker.removeEventListener("click", () => document.getElementById("imageInput").click());
            imagePicker.classList.remove("disabled");
            const image = document.getElementById('uploadedImage');
            image.classList.add("crosshair_hover");
            image.classList.remove("removePointerEvents");
            e.disabled = false;
            e.innerText = "Stop Selecting";
            state = "Selecting";
            break;
        }
    }
}

function beginPlot(beginX, beginY) {
    clearPath("lmfao");
    trace_ctx.beginPath();
    trace_ctx.moveTo(beginX, beginY);
}

function plotLine(toX, toY) {
    trace_ctx.strokeStyle = document.getElementById("lineColour").value;
    trace_ctx.lineWidth = document.getElementById("lineThickness").value;
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
    let file = new Blob([data], { type: "text/plain;charset=utf-8" });
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
    if (worker) worker.postMessage(["undo"]);
}

function updateLine() {
    if (worker) worker.postMessage(["get"]);
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