const express = require("express");
const multer = require("multer");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const cors = require("cors");

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
