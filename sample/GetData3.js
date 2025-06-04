/*!
 * MIT License（MITライセンス）
 * Copyright (c) 2025 Tanagotti
 * 
 * This software is released under the MIT License.
 * See https://opensource.org/licenses/MIT for details.
 * 
 * 本ソフトウェアはMITライセンスのもとで公開されています。
 * 詳細は上記URLをご確認ください。
 */

// シリアルポート、ライター、リーダーの初期化
let port, writer, reader;
let lineBuffer = "";  // 受信データのバッファ
let dataPoints = { kion: [], kiatsu: [], kodosa: [], shitsu: [], time: [] };  // 気温, 気圧, 高度, 湿度, 時間のデータ格納
let chart;  // グラフオブジェクト
const MAX_DATA_POINTS = 300;  // 最大データ保存数　デフォルト300
let isLogging = false;  // データ収集フラグ
let p0Value = "--";  // P0の値を保存

// シリアル接続ボタンがクリックされた際の処理
async function connectSerial() {
    try {
        port = await navigator.serial.requestPort();  // シリアルポートを選択
        await port.open({ baudRate: 115200 });  // ボーレート115200でポートを開く
        writer = port.writable.getWriter();  // 書き込み用ライター取得
        reader = port.readable.getReader();  // 読み込み用リーダー取得
        console.log("シリアル接続完了");
        document.getElementById("start-logging").disabled = false;  // ロギング開始ボタンを有効化
    } catch (err) {
        console.error("シリアル接続エラー:", err);  // エラー発生時の処理
    }
}

// シリアル接続ボタンにイベントを設定
document.getElementById("connect").addEventListener("click", connectSerial);

// データ収集開始ボタンがクリックされた際の処理
document.getElementById("start-logging").addEventListener("click", () => {
    isLogging = true;  // ロギング開始フラグをセット
    console.log("データ収集開始");
    startDataRequest();  // データ取得要求を開始
    if (writer) {
        writer.write(new TextEncoder().encode("RESET_P0\n"));  // P0初期化コマンドを送信
    }
    readLoop();  // データの読み取り開始
});

// P0初期化ボタンがクリックされた際の処理
document.getElementById("reset-p0").addEventListener("click", () => {
    if (writer) {
        writer.write(new TextEncoder().encode("RESET_P0\n"));  // P0初期化コマンドを送信
        console.log("P0初期化コマンド送信");
    } else {
        console.error("シリアル接続されていません");  // エラーメッセージ
    }
});

// データ取得要求を一定時間ごとに送信する関数　デフォルト１秒（1000ミリ秒）
function startDataRequest() {
    setInterval(async () => {
        if (writer) {
            await writer.write(new TextEncoder().encode("GET\n"));  // データ要求を送信
        }
    }, 1000);//ここの数値を変えるとデータ取得の間隔が変化。micro:bitの精度の関係で最小200ミリ秒
}

// P0の値をブラウザに表示する関数
function updateP0Display(p0) {
    document.getElementById("p0-display").textContent = p0.toFixed(2);
}

// シリアルデータを非同期で読み取る関数
async function readLoop() {
    while (true) {
        try {
            const { value, done } = await reader.read();  // シリアルデータを読み込む
            if (done) break;  // 読み込み終了時にループを抜ける
            lineBuffer += new TextDecoder().decode(value);  // データをバッファに追加
            let lines = lineBuffer.split("\n");  // 改行でデータを分割
            lineBuffer = lines.pop();  // 未完了のデータはバッファに保存
            let now = new Date().toLocaleTimeString();  // 現在時刻を取得

            // 受信した各行に対して処理
            for (let line of lines) {
                if (line.startsWith("P0 updated:")) {
                    p0Value = parseFloat(line.replace("P0 updated:", ""));
                    updateP0Display(p0Value);  // P0の表示を更新
                } else {
                    let values = line.split(",").map(v => parseFloat(v));  // カンマ区切りデータを数値配列に変換
                    if (values.length === 4) {  // 期待されるデータの数（気温、気圧、高度、湿度）が揃っているか確認
                        let [kion, kiatsu, kodosa, shitsu] = values;
                        dataPoints.kion.push(kion);
                        dataPoints.kiatsu.push(kiatsu);
                        dataPoints.kodosa.push(kodosa);
                        dataPoints.shitsu.push(shitsu);
                        dataPoints.time.push(now);

                        // 保存データが最大数を超えた場合、最古のデータを削除
                        if (dataPoints.kion.length > MAX_DATA_POINTS) {
                            Object.keys(dataPoints).forEach(key => dataPoints[key].shift());
                        }
						updateDataDisplay(now, kion, kiatsu, kodosa, shitsu);  // 取得データをブラウザに表示
						updateChart();  // ここでグラフを更新する
                    }
                }
            }
        } catch (err) {
            console.error("データ取得エラー:", err);  // エラー発生時の処理
            break;
        }
    }
}
// 取得したデータをブラウザに表示する関数
function updateDataDisplay(time, kion, kiatsu, kodosa, shitsu) {
    document.getElementById("time-display").textContent = time;  // 時刻を表示
    document.getElementById("kion-display").textContent = kion.toFixed(2);  // 気温を表示
    document.getElementById("kiatsu-display").textContent = kiatsu.toFixed(2);  // 気圧を表示
    document.getElementById("kodosa-display").textContent = kodosa.toFixed(2);  // 標高差を表示
    document.getElementById("shitsu-display").textContent = shitsu.toFixed(2);  // 湿度を表示
}

// グラフを更新する関数
function updateChart() {
    if (!chart) {
        const ctx = document.getElementById("chart").getContext("2d");
        chart = new Chart(ctx, {
            type: "line",
            data: {
                labels: dataPoints.time,
                datasets: [
                    { label: "気温 (℃)", data: dataPoints.kion, borderColor: "red", fill: false, yAxisID: 'y1' },
                    { label: "湿度 (%)", data: dataPoints.shitsu, borderColor: "purple", fill: false, yAxisID: 'y2' },
                    { label: "気圧 (hPa)", data: dataPoints.kiatsu, borderColor: "blue", fill: false, yAxisID: 'y3' },
                    { label: "標高差 (m)", data: dataPoints.kodosa, borderColor: "green", fill: false, yAxisID: 'y4' }
                ]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: { title: { display: true, text: "時間 (hh:mm:ss)" } },
                    y1: {
                        type: "linear",
                        position: "left",
                        title: { display: true, text: "気温 (℃)" },
                        min: 0,
                        max: 50
                    },
                    y2: {
                        type: "linear",
                        position: "left",
                        title: { display: true, text: "湿度 (%)" },
                        min: 0,
                        max: 100,
                        grid: { drawOnChartArea: false }
                    },
                    y3: {
                        type: "linear",
                        position: "right",
                        title: { display: true, text: "気圧 (hPa)" },
                        min: 900,
                        max: 1050
                    },
                    y4: {
                        type: "linear",
                        position: "right",
                        title: { display: true, text: "標高差 (m)" },
                        min: -15,
                        max: 1000,
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    } else {
        chart.data.labels = dataPoints.time;
        chart.data.datasets[0].data = dataPoints.kion;
        chart.data.datasets[1].data = dataPoints.shitsu;
        chart.data.datasets[2].data = dataPoints.kiatsu;
        chart.data.datasets[3].data = dataPoints.kodosa;
        chart.update();
    }
}


// CSVダウンロードボタンがクリックされたときの処理
document.getElementById("download-csv").addEventListener("click", downloadCSV);

function downloadCSV() {
    if (dataPoints.time.length === 0) {
        alert("データがありません");
        return;
    }

    let csvContent = "Jikoku,Kion(C),Kiatsu(hPa),Hyokosa(m),Shitsudo(%)\n";
    for (let i = 0; i < dataPoints.time.length; i++) {
        let time = dataPoints.time[i] || "";
        let kion = dataPoints.kion[i] !== undefined ? dataPoints.kion[i].toFixed(2) : "";
        let kiatsu = dataPoints.kiatsu[i] !== undefined ? dataPoints.kiatsu[i].toFixed(2) : "";
        let kodosa = dataPoints.kodosa[i] !== undefined ? dataPoints.kodosa[i].toFixed(2) : "";
        let shitsu = dataPoints.shitsu[i] !== undefined ? dataPoints.shitsu[i].toFixed(2) : "";
        csvContent += `${time},${kion},${kiatsu},${kodosa},${shitsu}\n`;
    }

    let blob = new Blob([csvContent], { type: "text/csv" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "BME280_data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

