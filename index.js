const express = require("express");
const multer = require("multer");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const mammoth = require("mammoth");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Configuración de Puppeteer para Railway
const getPuppeteerConfig = () => {
  if (process.env.RAILWAY_ENVIRONMENT) {
    return {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    };
  }
  return { headless: true };
};

// Función para convertir DOCX a PDF usando Puppeteer
async function convertDocxToPdf(docxBuffer) {
  let browser;
  try {
    // Primero convertir DOCX a HTML
    const htmlResult = await mammoth.convertToHtml({ buffer: docxBuffer });
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 40px;
            line-height: 1.6;
          }
          .certificate {
            text-align: center;
            padding: 20px;
          }
        </style>
      </head>
      <body>
        <div class="certificate">
          ${htmlResult.value}
        </div>
      </body>
      </html>
    `;

    // Luego convertir HTML a PDF usando Puppeteer
    browser = await puppeteer.launch(getPuppeteerConfig());
    const page = await browser.newPage();
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    return pdfBuffer;
  } finally {
    if (browser) {
      await browser.close();
    }
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
        console.log("Convirtiendo DOCX a PDF...");
        buffer = await convertDocxToPdf(buffer);
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

    const filename = `certificado_${data.nombre || 'generado'}.${extension}`.replace(/\s+/g, '_');

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
  
  // Redirigir al endpoint principal
  return app.handle(req, res);
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
        buffer = await convertDocxToPdf(buffer);
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
app.get("/verificar-plantilla", (req, res) => {
  let templatePath = path.join(__dirname, "Certificado.docx");
  let exists = fs.existsSync(templatePath);
  
  if (!exists) {
    templatePath = path.join(__dirname, "certificado.docx");
    exists = fs.existsSync(templatePath);
  }
  
  res.json({
    plantilla_existe: exists,
    ruta: templatePath,
    archivos_en_directorio: fs.readdirSync(__dirname),
    conversion_pdf: "Puppeteer disponible",
    entorno: process.env.RAILWAY_ENVIRONMENT ? "Railway" : "Local"
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    formatos_soportados: ["docx", "pdf"],
    motor_conversion: "Puppeteer + Mammoth",
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
  
  console.log("🔧 Conversión PDF habilitada con Puppeteer");
});
