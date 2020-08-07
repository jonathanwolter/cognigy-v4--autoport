const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const fieldsjs = require('./scripts/fields.js');
const old_package = require("./package.json");
const copyRecursiveSync = require('./scripts/copyRecursiveSync.js')

//copies files either from autoport (customized) or from ./template to ./finished.
let copyFromRootOrTemplate = function copyFromRootOrTemplate(dest) {
    process.stdout.write(" - copying template file "+dest+"\r")
    if(!dest[0] == "/"){
        dest = "/"+ dest;
    }
    if (fs.existsSync(path.join(__dirname, dest))) {
        copyRecursiveSync.copyRecursiveSync(path.join(__dirname, dest), dest);
    } else {
        copyRecursiveSync.copyRecursiveSync(path.join(__dirname, "/template/", dest), dest);
    }
    
    process.stdout.write(' - finished copying template file ' + dest + "\n");
}

//for each node
let writeNodeCode = function writeNodeCode(imports, array) {
    let nodeName = "";
    let fields = "";
    let config_vals = "";

    let last_line = 0;

    for (let i = 0; i < array.length; i++) {
        if (array[i].includes("module.exports.")) {
            const nodeNameLine = array[i].toString().split(" ");
            nodeName = nodeNameLine[nodeNameLine.length - 1].replace("\r", "").replace(";", "");
        }
    }
    const file = `./src/nodes/${nodeName}.ts`;
    //check if file already exists
    if (fs.existsSync(file)) {
        console.log(`./src/nodes/${nodeName}.ts already exists! exiting...`);
        exit();
    }
    fs.appendFileSync(file, imports);

    fs.appendFileSync(file, `export interface I${nodeName} extends INodeFunctionBaseParams {
    config: {\n      `);
    for (let i = 0; i < array.length; i++) {
        if (array[i].includes(" * @arg")) {
            const fields_output = fieldsjs.fields(array[i]);
            config_vals += fields_output[1];
            fields += fields_output[0];
        } else if (array[i].includes("async function")) {
            last_line = i + 1;
            break;
        }
    }
    fs.appendFileSync(file, config_vals);
    fs.appendFileSync(file, `\n  }
}\n
export const ${nodeName} = createNodeDescriptor({
  type: "${nodeName}",
  fields: [\n`);
    fs.appendFileSync(file, fields + `\n  ],
  function: async ({ cognigy, config }: I${nodeName}) => {
    const { api } = cognigy;
    const { ${config_vals.replace(/: any/g, "").replace(/\s/g, "").replace(/;/g, ", ").replace(/:{apikey, }/g, "")} } = config;\n`);
    if (config_vals.includes("connection")) {
        fs.appendFileSync(file, `const { apikey } = connection;\n`);
    }

    let script = "";
    for (i = last_line; i < array.length; i++) {
        if (!array[i].includes("= args") && !array[i].includes("= args") && !array[i].includes("module.exports.") && !array[i].includes("return input;") && !array[i].includes("return cognigy;")) {
            script += array[i].replace(/input.actions/g, "api").replace(/secret/g, "connection").replace(/api-key/gi, "apikey").replace(
                /cognigy.actions/g, "api").replace(/args/g, "config").replace(/input/g, "api");
            script = script.replace(`return input;`, "").replace(`module.exports.getNewsHeadlines = getNewsHeadlines;`, "");
        }
    }
    script += "});";

    fs.appendFileSync(file, script);
    return nodeName;
}

//only once
let portModuleCode = function portModulecode() {
    process.stdout.write(" - creating source folder\r")
    fs.mkdirSync("./src/");
    fs.mkdirSync("./src/nodes");
    fs.mkdirSync("./src/connections");

    copyRecursiveSync.copyRecursiveSync(path.join(__dirname, "/template/", "apiKeyConnection.ts"), "./src/connections/apiKeyConnection.ts");
    process.stdout.write(" - finsihed creating source folder\n")

    fs.appendFileSync("./src/module.ts", `import { createExtension } from "@cognigy/extension-tools";\n\n`)
    console.log(" - finished creating 'module.ts'");

    //since all nodes were in one file in v3, the "require"'s have to be saved and inserted in every v4 node file  
    let imports = `import { createNodeDescriptor, INodeFunctionBaseParams } from "@cognigy/extension-tools";\n`

    process.stdout.write(" - reading old code\r");
    let code = fs.readFileSync(path.join(__dirname, '/module.ts')).toString().split("/**\r\n");
    process.stdout.write(" - finished reading old code\n");

    //array for imports
    let import_array = code[0].split("\n");
    let dependencies = [];
    //line by line include requires
    for (let i = 0; i < import_array.length; i++) {
        if (import_array[i].includes("require(") && import_array[i].includes("const")) {
            imports += import_array[i] + "\n";
            let dependencies_temp = import_array[i].split("require('")
            console.log(dependencies_temp[dependencies_temp.length-1].replace("');\r", ""));
            dependencies.push(dependencies_temp[dependencies_temp.length-1].replace("');\r", ""));
        }if (import_array[i].includes("import") && import_array[i].includes("from")) {
            imports += import_array[i] + "\n";
            let dependencies_temp = import_array[i].split("from '")
            dependencies.push(dependencies_temp[dependencies_temp.length-1].replace("';", "").replace("\r", ""));
        }
    }

    let nodes = "";

    for (let i = 1; i < code.length; i++) {
        const nodeNameinModule = writeNodeCode(imports, code[i].split("\n"))
        console.log(" - finished translating node " + nodeNameinModule)
        fs.appendFileSync("./src/module.ts", `import { ${nodeNameinModule} } from "./nodes/${nodeNameinModule}";\n`);
        nodes += nodeNameinModule + ",\n";
    }
    fs.appendFileSync("./src/module.ts", `import { apiKeyConnection } from "./connections/apiKeyConnection";\n`);
    fs.appendFileSync("./src/module.ts", `export default createExtension({\nnodes: [\n${nodes}\n],\nconnections: [apiKeyConnection]});`);
    console.log(" - finished module.ts")
    return dependencies;
}

let main = function main(){
    //check if necessary files are available
    if (!fs.existsSync("./module.ts")) {
        console.log("Please copy the module.ts file in this folder! This file cannot translate a hypothetical custom module to a Cognigy 4 Extension, sadly.");
        exit();
    }if (!fs.existsSync("./package.json")) {
        console.log("Please copy the package.json file in this folder! This file cannot translate a hypothetical custom module to a Cognigy 4 Extension, sadly.");
        exit();
    }

    //make ./finished (ouput) folder and change working directory
    try{
        if (!fs.existsSync("./finished/"+old_package.name)) {
            console.log(" - creating folder...")
            fs.mkdirSync("./finished/"+old_package.name);
        }
        process.chdir("./finished/"+old_package.name);
    }catch{
        console.log("something went wrong changing to the project folder")
    }

    if (fs.existsSync("./src")) {
        fs.rmdirSync("./src", { recursive: true });
    }

    //copy/move template files
    if(true){ //only so i could collapse this section during development. I like it that way.
    copyFromRootOrTemplate("icon.png");
    copyFromRootOrTemplate("deploy.json");
    copyRecursiveSync.copyRecursiveSync(path.join(__dirname, "/template/scripts/"), "./scripts");
    copyFromRootOrTemplate("tsconfig.json");
    copyFromRootOrTemplate("tslint.json");
    }

    //"port" the actual code 
    const dependencies = portModuleCode();

    //update and copy the package.json, then install dependencies

    let package = require(path.join(__dirname, "/template/package.json"))

    package.name = old_package.name;
    package.description = old_package.description;
    package.author = old_package.author;
    fs.writeFileSync("./package.json", JSON.stringify(package, null, 2));

    dependencies.forEach(element => {execSync(`npm i ${element}`)});
    console.log("npm i");
    execSync("npm i");
}


main();






//Easter Egg: This script was written by Jonathan Wolter (15), in July 2020, as an intern at Cognigy GMBH!