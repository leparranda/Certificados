const express = require("express");
const multer = require("multer");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Función para convertir DOCX a PDF usando LibreOffice
async function convertDocxToPdfWithLibreOffice(docxBuffer) {
  const tempDir = path.join(__dirname, 'temp');
  const timestamp = Date.now();
  const inputPath = path.join(tempDir, `doc_${timestamp}.docx`);
  const outputPath = path.join(tempDir, `doc_${timestamp}.pdf`);
  
  try {
    // Crear directorio temporal si no existe
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Escribir el archivo DOCX temporal
    fs.writeFileSync(inputPath, docxBuffer);

    // Convertir usando LibreOffice
    const command = `libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`;
    console.log("Ejecutando comando:", command);
    
    await execAsync(command);

    // Leer el PDF generado
    if (!fs.existsSync(outputPath)) {
      throw new Error("LibreOffice no generó el archivo PDF");
    }

    const pdfBuffer = fs.readFileSync(outputPath);

    // Limpiar archivos temporales
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.warn("Error limpiando archivos temporales:", cleanupError.message);
    }

    return pdfBuffer;
  } catch (error) {
    // Limpiar archivos en caso de error
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.warn("Error limpiando archivos tras fallo:", cleanupError.message);
    }
    throw error;
  }
}

// ENDPOINT PRINCIPAL - Genera DOCX o PDF
app.post("/generar-desde-datos", async (req, res) => {
  console.log("Body recibido:", JSON.stringify(req.body, null, 2));
  
  const { data, formato = 'pdf' } = req.body;
  
  if (!data) {
    console.error("No se recibió el campo 'data'");
    return res.status(400).json({ error: "Campo 'data' requerido" });
  }

  console.log("Generando certificado para:", data.nombre, "en formato:", formato);

  try {
    // Leer la plantilla desde el servidor
    let templatePath = path.join(__dirname, "Certificado.docx");
    
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(__dirname, "certificado.docx");
    }
    
    if (!fs.existsSync(templatePath)) {
      console.error("Plantilla no encontrada. Archivos disponibles:", fs.readdirSync(__dirname));
      return res.status(500).json({ error: "Plantilla no encontrada en el servidor" });
    }

    const templateBuffer = fs.readFileSync(templatePath);
    console.log("Plantilla cargada, tamaño:", templateBuffer.length);
    
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Establecer los datos en la plantilla
    doc.setData(data);
    doc.render();

    let buffer = doc.getZip().generate({ type: "nodebuffer" });
    let contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    let extension = "docx";

    // Si se solicita PDF, convertir el documento
    if (formato === 'pdf') {
      try {
        console.log("Convirtiendo DOCX a PDF con LibreOffice...");
        buffer = await convertDocxToPdfWithLibreOffice(buffer);
        contentType = "application/pdf";
        extension = "pdf";
        console.log("Conversión a PDF exitosa");
      } catch (conversionError) {
        console.error("Error en conversión a PDF:", conversionError);
        return res.status(500).json({ 
          error: "Error al convertir a PDF: " + conversionError.message 
        });
      }
    }

    const filename = `Certificado${data.identificacion || 'generado'}.${extension}`.replace(/\s+/g, '_');

    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename=${filename}`,
      "Content-Length": buffer.length
    });

    console.log(`Certificado generado exitosamente en formato ${extension.toUpperCase()} para:`, data.nombre);
    res.send(buffer);
    
  } catch (error) {
    console.error("Error generando certificado:", error);
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT ESPECÍFICO SOLO PARA PDF
app.post("/generar-pdf", async (req, res) => {
  // Forzar formato PDF
  req.body.formato = 'pdf';
  
  // Llamar al endpoint principal manualmente
  return app._router.handle({
    ...req,
    url: '/generar-desde-datos',
    method: 'POST'
  }, res);
});

// ENDPOINT ORIGINAL - Mantener para compatibilidad
app.post("/generar", upload.single("plantilla"), async (req, res) => {
  const { body, file } = req;
  const data = JSON.parse(body.data);
  const formato = body.formato || 'docx';

  try {
    const zip = new PizZip(file.buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.setData(data);
    doc.render();

    let buffer = doc.getZip().generate({ type: "nodebuffer" });
    let contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    let extension = "docx";

    if (formato === 'pdf') {
      try {
        buffer = await convertDocxToPdfWithLibreOffice(buffer);
        contentType = "application/pdf";
        extension = "pdf";
      } catch (conversionError) {
        console.error("Error en conversión a PDF:", conversionError);
        return res.status(500).json({ 
          error: "Error al convertir a PDF: " + conversionError.message 
        });
      }
    }

    const filename = `certificado_generado.${extension}`;

    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename=${filename}`,
    });

    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de verificación
app.get("/verificar-plantilla", async (req, res) => {
  let templatePath = path.join(__dirname, "Certificado.docx");
  let exists = fs.existsSync(templatePath);
  
  if (!exists) {
    templatePath = path.join(__dirname, "certificado.docx");
    exists = fs.existsSync(templatePath);
  }
  
  // Verificar LibreOffice
  let libreofficeVersion = "No disponible";
  try {
    const { stdout } = await execAsync("libreoffice --version");
    libreofficeVersion = stdout.trim();
  } catch (error) {
    console.warn("LibreOffice no disponible:", error.message);
  }
  
  res.json({
    plantilla_existe: exists,
    ruta: templatePath,
    archivos_en_directorio: fs.readdirSync(__dirname),
    libreoffice_version: libreofficeVersion,
    entorno: process.env.RAILWAY_ENVIRONMENT ? "Railway" : "Local"
  });
});

// Health check
app.get("/health", async (req, res) => {
  // Verificar LibreOffice
  let libreofficeStatus = "No disponible";
  try {
    await execAsync("libreoffice --version");
    libreofficeStatus = "Disponible";
  } catch (error) {
    libreofficeStatus = "Error: " + error.message;
  }

  res.json({
    status: "OK",
    formatos_soportados: ["docx", "pdf"],
    motor_conversion: "LibreOffice",
    libreoffice_status: libreofficeStatus,
    entorno: process.env.RAILWAY_ENVIRONMENT ? "Railway" : "Local"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local'}`);
  
  // Verificar plantilla
  let templatePath = path.join(__dirname, "Certificado.docx");
  if (fs.existsSync(templatePath)) {
    console.log("✅ Plantilla Certificado.docx encontrada");
  } else {
    templatePath = path.join(__dirname, "certificado.docx");
    if (fs.existsSync(templatePath)) {
      console.log("✅ Plantilla certificado.docx encontrada");
    } else {
      console.log("❌ Plantilla NO encontrada");
    }
  }
  
  console.log("🔧 Conversión PDF habilitada con LibreOffice");
});
