const video = document.getElementById('video');
const statusDiv = document.getElementById('status');
const reportBody = document.getElementById('report-body');
const clearLogBtn = document.getElementById('clearLog');

// Dados fictícios para simular rostos já cadastrados na faculdade (Alunos/Professores)
// Em produção, você carregaria as fotos deles do banco de dados
const USUARIOS_CADASTRADOS = [
    { nome: "Aléssio", funcao: "Professor", foto: "rostos/alessio.jpg" },
    { nome: "Ana Silva", funcao: "Aluna", foto: "rostos/ana.jpg" }
];

let faceMatcher;
let ultimoRegistro = {};

// 1. Inicializar e Carregar Modelos da face-api.js
async function iniciarAplicativo() {
    try {
        // URL alternativa e estável para carregar os pesos da IA se não estiverem locais
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        
        statusDiv.innerText = "Modelos carregados. Treinando assinaturas...";
        await treinarRostosConhecidos();
        
        statusDiv.innerText = "Pronto! Iniciando câmera...";
        statusDiv.className = "status-ready";
        
        iniciarVideo();
    } catch (err) {
        console.error("Erro ao iniciar IA:", err);
        statusDiv.innerText = "Erro ao carregar inteligência artificial.";
    }
}

// 2. Ligar a Câmera
function iniciarVideo() {
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => { video.srcObject = stream; })
        .catch(err => console.error("Erro ao acessar câmera: ", err));
}

// 3. Gerar os vetores matemáticos (descriptors) das fotos salvas
async function treinarRostosConhecidos() {
    const labeledDescriptors = await Promise.all(
        USUARIOS_CADASTRADOS.map(async usuario => {
            try {
                const img = await faceapi.fetchImage(usuario.foto);
                const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                if (!detections) throw new Error(`Não foi possível detectar rosto para ${usuario.nome}`);
                
                // Armazena junto o nome e função separados por um delimitador "|"
                return new faceapi.LabeledFaceDescriptors(`${usuario.nome}|${usuario.funcao}`, [detections.descriptor]);
            } catch (e) {
                console.warn(e.message);
                return null;
            }
        })
    );
    // Filtra cadastros que falharam
    const validDescriptors = labeledDescriptors.filter(d => d !== null);
    
    // Cria o comparador de rostos (limiar de precisão de 0.6)
    if (validDescriptors.length > 0) {
        faceMatcher = new faceapi.FaceMatcher(validDescriptors, 0.6);
    }
}

// 4. Loop de Reconhecimento em Tempo Real ao reproduzir o vídeo
video.addEventListener('play', () => {
    const canvas = document.getElementById('overlay');
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
        if (!faceMatcher) return;

        // Detecta rostos no frame do vídeo
        const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        // Limpa o canvas anterior
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        resizedDetections.forEach(detection => {
            const result = faceMatcher.findBestMatch(detection.descriptor);
            let label = "Desconhecido";
            let funcao = "N/A";

            if (result.label !== 'unknown') {
                [label, funcao] = result.label.split('|');
                salvarNoRelatorio(label, funcao);
            }

            // Desenha caixa e nome na tela
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { label: `${label} (${funcao})` });
            drawBox.draw(canvas);
        });
    }, 500); // Roda a cada 500ms para poupar CPU/Bateria
});

// 5. Adicionar registros ao Relatório (e salvar no LocalStorage)
function salvarNoRelatorio(nome, funcao) {
    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR');
    
    // Evita registrar a mesma pessoa repetidamente em menos de 15 segundos
    if (ultimoRegistro[nome] && (agora - ultimoRegistro[nome] < 15000)) return;
    ultimoRegistro[nome] = agora;

    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${nome}</strong></td><td>${funcao}</td><td>${horaFormatada}</td>`;
    reportBody.prepend(tr); // Adiciona no topo da tabela

    // Aqui você pode também persistir no IndexedDB ou LocalStorage se quiser guardar histórico offline
}

// Limpar relatório visual
clearLogBtn.addEventListener('click', () => { reportBody.innerHTML = ""; ultimoRegistro = {}; });

// Registro do Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado!'))
            .catch(err => console.warn('Erro ao registrar Service Worker', err));
    });
}

// Inicializa tudo
iniciarAplicativo();
