import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { extname } from "node:path";

// Runs only in the checked-out feature branch via GitHub Actions; never touches main.
const branch = execFileSync("git", ["branch", "--show-current"], {encoding:"utf8"}).trim();
if(branch !== "feat/auto-standardization") throw new Error("Refusing to change branch: "+branch);
const tracked = execFileSync("git",["ls-files","-z"],{encoding:"utf8"}).split("\0").filter(Boolean);
const extensions = new Set([".md",".mdx",".txt",".html",".tsx",".ts",".jsx",".js",".mjs",".css",".scss",".yaml",".yml"]);
const ignore = /(^|\/)(node_modules|\.next|\.git|dist|build|vendor|\.openai|\.agents|android|ios|__snapshots__)(\/|$)|(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|bun\.lock|yarn\.lock)$|\.min\.js$|(^|\/)scripts\/auto-standardize\.mjs$/i;
const rules = [
 [new RegExp(["No-Code"," Builder"].join(""),"g"), "NuvoraCraft"],
 [new RegExp(["NPT Duy"," Studio"].join(""),"g"), "NuvoraCraft"],
 [new RegExp(["npt-duy","-no-code-studio"].join(""),"g"), "nuvoracraft"],
];
let count=0;
for(const path of tracked){
 if(ignore.test(path)||!extensions.has(extname(path).toLowerCase()))continue;
 try {
  if(statSync(path).size>3_000_000)continue;
  const input=readFileSync(path,"utf8");
  if(input.includes("\0"))continue;
  const next=input.split("\n").map(line=>{
   // Preserve actual repository and deployment URL paths, imports and source module references.
   if(/https?:\/\//.test(line)&&/(github\.com|vercel\.app|pages\.dev)/.test(line))return line;
   return rules.reduce((text,[from,to])=>text.replace(from,to),line);
  }).join("\n");
  if(next!==input){writeFileSync(path,next);count++;console.log("Standardized:",path)}
 }catch(error){console.error("Skipped unreadable file",path,error.message)}
}
console.log("Tracked source/doc files updated:",count);
