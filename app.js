// Fotos que você salvou manualmente na pasta "rostos" do seu projeto/GitHub
const FOTOS_NA_PASTA = [
    { nome: "Aléssio", funcao: "Professor", foto: "rostos/alessio.jpg" },
    { nome: "Ana Silva", funcao: "Aluna", foto: "rostos/ana.html" }, // se for .png ou .jpeg altere a extensão aqui
    { nome: "Carlos Souza", funcao: "Professor", foto: "rostos/carlos.jpg" }
];
// Seleção de elementos das abas
const tabMonitoramento = document.getElementById('tabMonitoramento');
const tabAdmin = document.getElementById('tabAdmin');
const viewMonitoramento = document.getElementById('viewMonitoramento');
const viewAdmin = document.getElementById('viewAdmin');

// Elementos de tela
const video = document.getElementById('video');
const videoCapture = document.getElementById('videoCapture');
const statusDiv = document.getElementById('status');
const reportBody = document.getElementById('report-body');
const usuariosBody = document.getElementById('usuarios-cadastrados-body');
const clearLogBtn = document.getElementById('clearLog');

// Formulário e Captura
const cadastroForm = document.getElementById('cadastroForm');
const btnTirarFoto = document.getElementById('btnTirarFoto');
const canvasPreview = document.getElementById('canvasPreview');
const captureStatus = document.getElementById('captureStatus');
const btnSalvarCadastro = document.getElementById('btnSalvarCadastro');

let faceMatcher;
let ultimoRegistro = {};
let db;
let fotoCapturadaBase64 = null;
let streamMonitoramento = null;
let streamCadastro = null;

// --- 1. CONFIGURAÇÃO DO BANCO DE DADOS LOCAL (IndexedDB) ---
function inicializarBancoDados() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("CampusID_DB", 1);
        
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains("usuarios")) {
                db.createObjectStore("usuarios", { keyPath: "id", autoIncrement: true });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };

        request.onerror = (e) => reject("Erro ao abrir banco de dados local.");
    });
}

// --- 2. GERENCIAMENTO DE ABAS E CÂMERAS ---
tabMonitoramento.addEventListener('click', () => {
    tabAdmin.classList.remove('active');
    tabMonitoramento.classList.add('active');
    viewAdmin.classList.remove('active');
    viewMonitoramento.classList.add('active');
    desligarCamera(streamCadastro);
    iniciarCameraMonitoramento();
});

tabAdmin.addEventListener('click', () => {
    tabMonitoramento.classList.remove('active');
    tabAdmin.classList.add('active');
    viewMonitoramento.classList.remove('active');
    viewAdmin.classList.add('active');
    desligarCamera(streamMonitoramento);
    iniciarCameraCadastro();
    listarUsuariosCadastrados();
});

function desligarCamera(stream) {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

// Câmera da tela principal
function iniciarCameraMonitoramento() {
    navigator.mediaDevices.getUserMedia({ video: {} }).then(stream => {
        streamMonitoramento = stream;
        video.srcObject = stream;
    }).catch(err => console.error("Erro na câmera de monitoramento:", err));
}

// Câmera do painel admin
function iniciarCameraCadastro() {
    navigator.mediaDevices.getUserMedia({ video: {} }).then(stream => {
        streamCadastro = stream;
        videoCapture.srcObject = stream;
    }).catch(err => console.error("Erro na câmera de cadastro:", err));
}

// --- 3. INICIALIZAÇÃO DA IA ---
async function iniciarAplicativo() {
    try {
        await inicializarBancoDados();
        
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        statusDiv.innerText = "Carregando modelos de Inteligência Artificial...";
        
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        
        statusDiv.innerText = "Sincronizando assinaturas faciais...";
        await atualizarFaceMatcher();
        
        statusDiv.innerText = "Sistema de IA Pronto!";
        statusDiv.className = "status-ready";
        
        iniciarCameraMonitoramento();
    } catch (err) {
        console.error("Erro ao iniciar IA:", err);
        statusDiv.innerText = "Falha crítica na inicialização.";
    }
}

// --- 4. ENGINE DE RECONHECIMENTO FACIAL HÍBRIDO ---
async function atualizarFaceMatcher() {
    statusDiv.innerText = "Sincronizando assinaturas faciais...";
    
    // 1. Carregar assinaturas das fotos que estão na pasta física 'rostos/'
    const descritoresPasta = await Promise.all(
        FOTOS_NA_PASTA.map(async u => {
            try {
                const img = await faceapi.fetchImage(u.foto);
                const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                if (detection) {
                    return new faceapi.LabeledFaceDescriptors(`${u.nome}|${u.funcao}`, [detection.descriptor]);
                }
            } catch (e) { 
                console.warn(`Aviso: Não foi possível carregar a foto da pasta: ${u.foto}. Verifique se o arquivo existe.`); 
            }
            return null;
        })
    );

    // 2. Carregar assinaturas das fotos tiradas no painel Admin (IndexedDB)
    const transaction = db.transaction(["usuarios"], "readonly");
    const store = transaction.objectStore("usuarios");
    const request = store.getAll();

    return new Promise((resolve) => {
        request.onsuccess = async () => {
            const usuariosBanco = request.result;
            
            const descritoresBanco = await Promise.all(
                usuariosBanco.map(async u => {
                    try {
                        const img = await faceapi.fetchImage(u.foto);
                        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                        if (detection) {
                            return new faceapi.LabeledFaceDescriptors(`${u.nome}|${u.funcao}`, [detection.descriptor]);
                        }
                    } catch (e) { console.error("Erro ao ler foto do banco:", e); }
                    return null;
                })
            );

            // Juntar todos os descritores válidos (Pasta + Banco)
            const todosDescritores = [...descritoresPasta, ...descritoresBanco].filter(d => d !== null);

            if (todosDescritores.length > 0) {
                faceMatcher = new faceapi.FaceMatcher(todosDescritores, 0.55);
            } else {
                faceMatcher = null; // Nenhum rosto cadastrado em lugar nenhum
            }
            resolve();
        };
    });
}

// Loop do scanner em tempo real
video.addEventListener('play', () => {
    const canvas = document.getElementById('overlay');
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
        if (!faceMatcher || viewMonitoramento.classList.contains('active') === false) return;

        const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        resizedDetections.forEach(detection => {
            const result = faceMatcher.findBestMatch(detection.descriptor);
            let label = "Desconhecido";
            let funcao = "N/A";

            if (result.label !== 'unknown') {
                [label, funcao] = result.label.split('|');
                salvarNoRelatorio(label, funcao);
            }

            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { label: `${label} (${funcao})` });
            drawBox.draw(canvas);
        });
    }, 600);
});

function salvarNoRelatorio(nome, funcao) {
    const agora = new Date();
    if (ultimoRegistro[nome] && (agora - ultimoRegistro[nome] < 15000)) return;
    ultimoRegistro[nome] = agora;

    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${nome}</strong></td><td>${funcao}</td><td>${agora.toLocaleTimeString('pt-BR')}</td>`;
    reportBody.prepend(tr);
}

// --- 5. LÓGICA DO PAINEL ADMIN (TIRAR FOTO E SALVAR) ---
btnTirarFoto.addEventListener('click', async () => {
    const ctx = canvasPreview.getContext('2d');
    // Desenha o frame atual do vídeo de captura no canvas invisível
    ctx.drawImage(videoCapture, 0, 0, 320, 240);
    const dataUrl = canvasPreview.toDataURL('image/jpeg');

    captureStatus.innerHTML = "Validando enquadramento do rosto...";
    captureStatus.className = "";

    // Validação imediata: Só aceita a foto se a IA encontrar um rosto limpo nela
    const img = await faceapi.fetchImage(dataUrl);
    const detection = await faceapi.detectSingleFace(img);

    if (detection) {
        fotoCapturadaBase64 = dataUrl;
        captureStatus.innerText = "✔️ Rosto detectado com sucesso!";
        captureStatus.className = "text-success";
        btnSalvarCadastro.disabled = false;
    } else {
        fotoCapturadaBase64 = null;
        captureStatus.innerText = "❌ Nenhum rosto detectado. Olhe para a câmera e tente de novo.";
        captureStatus.className = "text-danger";
        btnSalvarCadastro.disabled = true;
    }
});

cadastroForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!fotoCapturadaBase64) return;

    const novoUsuario = {
        nome: document.getElementById('cadNome').value,
        funcao: document.getElementById('cadFuncao').value,
        foto: fotoCapturadaBase64
    };

    const transaction = db.transaction(["usuarios"], "readwrite");
    const store = transaction.objectStore("usuarios");
    store.add(novoUsuario);

    transaction.oncomplete = async () => {
        alert("Usuário cadastrado perfeitamente!");
        cadastroForm.reset();
        fotoCapturadaBase64 = null;
        btnSalvarCadastro.disabled = true;
        captureStatus.innerText = "";
        
        await atualizarFaceMatcher();
        listarUsuariosCadastrados();
    };
});

function listarUsuariosCadastrados() {
    usuariosBody.innerHTML = "";
    const transaction = db.transaction(["usuarios"], "readonly");
    const store = transaction.objectStore("usuarios");
    
    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const u = cursor.value;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.nome}</td>
                <td>${u.funcao}</td>
                <td><button class="btn-danger" onclick="deletarUsuario(${u.id})">Excluir</button></td>
            `;
            usuariosBody.appendChild(tr);
            cursor.continue();
        }
    };
}

window.deletarUsuario = (id) => {
    if (confirm("Tem certeza que deseja remover este cadastro?")) {
        const transaction = db.transaction(["usuarios"], "readwrite");
        const store = transaction.objectStore("usuarios");
        store.delete(id);
        transaction.oncomplete = async () => {
            await atualizarFaceMatcher();
            listarUsuariosCadastrados();
        };
    }
};

clearLogBtn.addEventListener('click', () => { reportBody.innerHTML = ""; });

// Inicialização imediata
iniciarAplicativo();
