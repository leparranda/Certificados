const express = require("express");
const multer = require("multer");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// NUEVO ENDPOINT - Solo recibe datos JSON (sin archivo de plantilla)
app.post("/generar-desde-datos", (req, res) => {
  console.log("Body recibido:", JSON.stringify(req.body, null, 2));
  
  const { data } = req.body;
  
  if (!data) {
    console.error("No se recibió el campo 'data'");
    return res.status(400).json({ error: "Campo 'data' requerido" });
  }

  console.log("Generando certificado para:", data.nombre);

  try {
    // Leer la plantilla desde el servidor (buscar con diferentes nombres)
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

    const buffer = doc.getZip().generate({ type: "nodebuffer" });

    const filename = `certificado_${data.nombre || 'generado'}.docx`.replace(/\s+/g, '_');

    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename=${filename}`,
    });

    console.log("Certificado generado exitosamente para:", data.nombre);
    res.send(buffer);
    
  } catch (error) {
    console.error("Error generando certificado:", error);
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT ORIGINAL - Mantener para compatibilidad
app.post("/generar", upload.single("plantilla"), (req, res) => {
  const { body, file } = req;
  const data = JSON.parse(body.data);

  try {
    const zip = new PizZip(file.buffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.setData(data);
    doc.render();

    const buffer = doc.getZip().generate({ type: "nodebuffer" });

    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": "attachment; filename=certificado_generado.docx",
    });

    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de prueba para verificar que la plantilla existe
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
    archivos_en_directorio: fs.readdirSync(__dirname)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  
  // Verificar que la plantilla existe al iniciar
  let templatePath = path.join(__dirname, "Certificado.docx");
  if (fs.existsSync(templatePath)) {
    console.log("✅ Plantilla Certificado.docx encontrada");
  } else {
    templatePath = path.join(__dirname, "certificado.docx");
    if (fs.existsSync(templatePath)) {
      console.log("✅ Plantilla certificado.docx encontrada");
    } else {
      console.log("❌ Plantilla NO encontrada");
      console.log("Archivos en directorio:", fs.readdirSync(__dirname));
    }
  }
});
