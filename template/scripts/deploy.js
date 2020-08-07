const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const { exit } = require('process');

let rawdata = fs.readFileSync(__dirname + '/../deploy.json');
let deploy = JSON.parse(rawdata);
const api_key = deploy.api_key;
const projectName = deploy.projectName;
const package = require(path.join(__dirname, '../package.json'));

const domain = "https://api-beta-v4.cognigy.ai/new/v2.0";

//check if .tar.gz is available
if(!fs.existsSync(path.join(__dirname + `/../${package.name}.tar.gz`))) {
  console.log("Error: no archive found! exiting...");
  exit();
}

getIDs(projectName);


function getIDs(projectName) {
  try {
  const projectID_URL = `${domain}/projects?filter=${projectName}&api_key=${api_key}`;
  axios.get(projectID_URL, {headers: {"Accept": "application/json, "}}).then(
  function(result) {
      const projectID = result.data._embedded.projects[0]._links.self.href.split("/").pop()
      getExtensionID(projectID);
    }
  );
  } catch{
    console.log("Error: no project found! exiting....");
    exit();
  }
}

function getExtensionID(projectID) {
  let extensionID_URL = `${domain}/extensions?projectId=${projectID}&filter=${package.name}&api_key=${api_key}`;
  axios.get(extensionID_URL, {headers: {"Accept": "application/json, "}}).then(
    function(result) {
      try{
      deleteExtension(result.data._embedded.extensions[0]);
      }catch{
        console.log("Warning: no previous version!");
      }
      uploadfile(projectID);
    }
  );
}

function deleteExtension(result){
  const extensionID = (result._links.self.href).split("/").pop();
  axios.delete(`${domain}/extensions/${extensionID}?api_key=${api_key}`);
  console.log("deleted old version")
}

function uploadfile(projectID) {
  const packagename = package.name;
  console.log(`uploading /../${packagename}.tar.gz to ${domain}/extensions/upload?api_key=${api_key} to project ${projectID}`);

  const body = new FormData;
  body.append("projectId", projectID);  
  const readstream = fs.createReadStream(path.join(__dirname + `/../${packagename}.tar.gz`));
  body.append("package", readstream);

  fetch(`${domain}/extensions/upload?api_key=${api_key}`, {
    method: 'POST',
    body, 
    headers: {
      Accept: "application/json"
    }
  }).then((response) => response.json())
  .then((result) => {
    console.log('Success!');
  })
  .catch((error) => {
    console.error('Error:');
  });
}