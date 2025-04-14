import fs from 'fs';
import path from 'path';

const basePath = path.resolve(__dirname, '../../');

function getFilePath(fileName: string) {
  return path.join(basePath, `${fileName}.json`);
}

// 📘 Lê o conteúdo de um arquivo JSON
export function readJSONFile(fileName: string, defaultValue = []) {
  const filePath = getFilePath(fileName);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Erro ao ler o arquivo ${fileName}.json:`, error);
  }
  return defaultValue;
}

// 💾 Escreve dados no arquivo JSON (sobrescreve)
export function writeJSONFile(fileName: string, data: any) {
  const filePath = getFilePath(fileName);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Erro ao escrever no arquivo ${fileName}.json:`, error);
  }
}

// 📌 Adiciona um novo item no arquivo JSON (append)
export function appendToJSONFile(fileName: string, newData: any) {
  const data = readJSONFile(fileName);
  data.push(newData);
  writeJSONFile(fileName, data);
}

// 📝 Loga operações no terminal e salva no arquivo .log
export function logOperation(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync('operations.log', logMessage);
  console.log(logMessage);
}
