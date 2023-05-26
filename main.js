//Tomar y configurar el canvas
var canvas = document.getElementById("canvas");
var video = document.getElementById("video");
let btn_req  = document.getElementById('btn-request');
var ctx = canvas.getContext("2d");
var modelo = null;
var size = 400;
var camaras = [];

var currentStream = null;
var facingMode = "user"; //Para que funcione con el celular (user/environment)

(async () => {
    console.log("Cargando modelo...");
    modelo = await tf.loadLayersModel("/flowers_v2_web/model.json");
    console.log("Modelo cargado...");
})();

window.onload = function () {
    mostrarCamara();
}

btn_req.addEventListener('click',function(){
    predecir();
})


function mostrarCamara() {

    var opciones = {
        audio: false,
        video: {
            facingMode: "user", width: size, height: size
        }
    };

    if (navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia(opciones)
            .then(function (stream) {
                currentStream = stream;
                video.srcObject = currentStream;
                procesarCamara();
            })
            .catch(function (err) {
                alert("No se pudo utilizar la camara :(");
                console.log("No se pudo utilizar la camara :(", err);
                alert(err);
            })
    } else {
        alert("No existe la funcion getUserMedia... oops :( no se puede usar la camara");
    }
}

function cambiarCamara() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
    }

    facingMode = facingMode == "user" ? "environment" : "user";

    var opciones = {
        audio: false,
        video: {
            facingMode: facingMode, width: size, height: size
        }
    };


    navigator.mediaDevices.getUserMedia(opciones)
        .then(function (stream) {
            currentStream = stream;
            video.srcObject = currentStream;
        })
        .catch(function (err) {
            console.log("Oops, hubo un error", err);
        })
}

function predecir() {
    if (modelo != null) {
        //Pasar canvas a version 200x200
        resample_single(canvas, 200, 200, othercanvas);

        var ctx2 = othercanvas.getContext("2d");

        var imgData = ctx2.getImageData(0, 0, 200, 200);
        var arr = []; //El arreglo completo
        var arr200 = []; //Al llegar a arr200 posiciones se pone en 'arr' como un nuevo indice
        for (var p = 0, i = 0; p < imgData.data.length; p += 4) {
            var red = imgData.data[p] / 255;
            var green = imgData.data[p + 1] / 255;
            var blue = imgData.data[p + 2] / 255;
            arr200.push([red, green, blue]); //Agregar al arr200 y normalizar a 0-1. Aparte queda dentro de un arreglo en el indice 0... again
            if (arr200.length == 200) {
                arr.push(arr200);
                arr200 = [];
            }
        }

        arr = [arr]; //Meter el arreglo en otro arreglo por que si no tio tensorflow se enoja >:(
        //Nah basicamente Debe estar en un arreglo nuevo en el indice 0, por ser un tensor4d en forma 1, 200, 200, 1
        var tensor4 = tf.tensor4d(arr);
        var resultados = modelo.predict(tensor4).dataSync();
        var mayorIndice = resultados.indexOf(Math.max.apply(null, resultados));

        let possible_results = ['Margarita', 'Diente de león', 'Rosa', 'Girasol', 'Tulipán']
        console.log("Prediccion", resultados[mayorIndice]);
        document.getElementById("resultado").textContent = possible_results[mayorIndice];
    }
    //setTimeout(predecir, 200); llamada recursiva en caso de querer predecir al encender la cámara aunque no haya nada.

}

function procesarCamara() {

    var ctx = canvas.getContext("2d");

    ctx.drawImage(video, 0, 0, size, size, 0, 0, size, size);

    setTimeout(procesarCamara, 20);
}

/**
 * Hermite resize - fast image resize/resample using Hermite filter. 1 cpu version!
 * 
 * @param {HtmlElement} canvas
 * @param {int} width
 * @param {int} height
 * @param {boolean} resize_canvas if true, canvas will be resized. Optional.
 * Cambiado por RT, resize canvas ahora es donde se pone el chiqitillllllo
 */
function resample_single(canvas, width, height, resize_canvas) {
    var width_source = canvas.width;
    var height_source = canvas.height;
    width = Math.round(width);
    height = Math.round(height);

    var ratio_w = width_source / width;
    var ratio_h = height_source / height;
    var ratio_w_half = Math.ceil(ratio_w / 2);
    var ratio_h_half = Math.ceil(ratio_h / 2);

    var ctx = canvas.getContext("2d");
    var ctx2 = resize_canvas.getContext("2d");
    var img = ctx.getImageData(0, 0, width_source, height_source);
    var img2 = ctx2.createImageData(width, height);
    var data = img.data;
    var data2 = img2.data;

    for (var j = 0; j < height; j++) {
        for (var i = 0; i < width; i++) {
            var x2 = (i + j * width) * 4;
            var weight = 0;
            var weights = 0;
            var weights_alpha = 0;
            var gx_r = 0;
            var gx_g = 0;
            var gx_b = 0;
            var gx_a = 0;
            var center_y = (j + 0.5) * ratio_h;
            var yy_start = Math.floor(j * ratio_h);
            var yy_stop = Math.ceil((j + 1) * ratio_h);
            for (var yy = yy_start; yy < yy_stop; yy++) {
                var dy = Math.abs(center_y - (yy + 0.5)) / ratio_h_half;
                var center_x = (i + 0.5) * ratio_w;
                var w0 = dy * dy; //pre-calc part of w
                var xx_start = Math.floor(i * ratio_w);
                var xx_stop = Math.ceil((i + 1) * ratio_w);
                for (var xx = xx_start; xx < xx_stop; xx++) {
                    var dx = Math.abs(center_x - (xx + 0.5)) / ratio_w_half;
                    var w = Math.sqrt(w0 + dx * dx);
                    if (w >= 1) {
                        //pixel too far
                        continue;
                    }
                    //hermite filter
                    weight = 2 * w * w * w - 3 * w * w + 1;
                    var pos_x = 4 * (xx + yy * width_source);
                    //alpha
                    gx_a += weight * data[pos_x + 3];
                    weights_alpha += weight;
                    //colors
                    if (data[pos_x + 3] < 255)
                        weight = weight * data[pos_x + 3] / 250;
                    gx_r += weight * data[pos_x];
                    gx_g += weight * data[pos_x + 1];
                    gx_b += weight * data[pos_x + 2];
                    weights += weight;
                }
            }
            data2[x2] = gx_r / weights;
            data2[x2 + 1] = gx_g / weights;
            data2[x2 + 2] = gx_b / weights;
            data2[x2 + 3] = gx_a / weights_alpha;
        }
    }


    ctx2.putImageData(img2, 0, 0);
}