const { existsSync } = require("fs");
const { join } = require("path");
const { spawn, ChildProcess } = require("child_process");
const https = require("https");

let { platform, arch } = process;

switch (platform) {
  case "darwin":
    platform = "osx";
    break;
  case "freebsd":
  case "linux":
  case "openbsd":
    break;
  case "sunos":
    platform = "solaris";
  case "win32":
    platform = "windows";
  default:
    break;
}

switch (arch) {
  case "arm":
  case "arm64":
  case "mips":
  case "mipsel":
    break;
  case "x32":
    arch = "386";
  case "x64":
    arch = "amd64";
  default:
    break;
}

const RCLONE_DIR = join(__dirname, "bin");
const DEFAULT_RCLONE_EXECUTABLE = join(RCLONE_DIR, `rclone${ platform === "windows"? ".exe" : "" }`);
const {
  RCLONE_EXECUTABLE = DEFAULT_RCLONE_EXECUTABLE,
} = process.env;

/**
 * Spawns a rclone process to execute with the supplied arguments.
 *
 * The last argument can also be an object with all the flags.
 *
 * @param {...string|object} args arguments for the API call.
 * @returns {ChildProcess} the rclone subprocess.
 */
const api = function(...args) {
  const flags = args.pop();
  if (!!flags && flags.constructor === Object) {
    Object.entries(flags).forEach(([key, value]) => {
      if (value === false) {
        key = `no-${ key }`;
      }
      args.push(`--${ key }`);
      if (typeof value !== "boolean") {
        args.push(`${ value }`);
      }
    });
  } else {
    // Not a flag object, push it back.
    args.push(flags);
  }

  return spawn(RCLONE_EXECUTABLE, args);
}

// Promise-based API.
const promises = api.promises = function(...args) {
  return new Promise((resolve, reject) => {
    const subprocess = api(...args);

    subprocess.on("error", (error) => {
      reject(error);
    });

    const stdout = [], stderr = [];
    subprocess.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });
    subprocess.stdout.on("end", () => {
      resolve(Buffer.concat(stdout));
    });
    subprocess.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });
    subprocess.stderr.on("end", () => {
      if (stderr.length) {
        reject(Buffer.concat(stderr));
      }
    });
  });
};

/**
 * Updates rclone binary based on current OS.
 * @returns {Promise}
 */
api.selfupdate = function(options = {}) {
  const {
    beta = false,
    stable = !beta,
    version,
    check = false,
  } = options;

  // Passes along to `rclone` if exists.
  if (existsSync(RCLONE_EXECUTABLE)) {
    return api("selfupdate", options);
  }

  const baseUrl = stable ? "https://downloads.rclone.org" : "https://beta.rclone.org";
  const channel = stable ? "current" : "beta-latest";

  if (check) {
    return get(`${ baseUrl }/version.txt`).then(version => {
      console.log(`The latest version is ${ version }`);
    });
  }

  console.log("Downloading rclone...");
  const archiveName = version ? `${ version }/rclone-${ version }` : `rclone-${ channel }`;
  return get(`${ baseUrl }/${ archiveName }-${ platform }-${ arch }.zip`).then(archive => {
    console.log("Extracting rclone...");
    const AdmZip = require("adm-zip");
    const { chmodSync } = require("fs");

    const zip = new AdmZip(archive);
    zip.getEntries().forEach((entry) => {
      const { name, entryName } = entry;
      if (/rclone(\.exe)?$/.test(name)) {
        zip.extractEntryTo(entry, RCLONE_DIR, false, true);
        // Make it executable.
        chmodSync(DEFAULT_RCLONE_EXECUTABLE, 0o755);

        console.log(`${ entryName.replace(`/${ name }`, "") } is installed.`);
      }
    });
  });
}

const COMMANDS = [
  "about", // Get quota information from the remote.
  "authorize", // Remote authorization.
  "backend", // Run a backend specific command.
  "cat",
  "check", // Checks the files in the source and destination match.
  "cleanup", // Clean up the remote if possible.
  "config", // Enter an interactive configuration session.
  "config create", // Create a new remote with name, type and options.
  "config delete", // Delete an existing remote name.
  "config disconnect", // Disconnects user from remote
  "config dump", // Dump the config file as JSON.
  "config edit", // Enter an interactive configuration session.
  "config file", // Show path of configuration file in use.
  "config password", // Update password in an existing remote.
  "config providers", // List in JSON format all the providers and options.
  "config reconnect", // Re-authenticates user with remote.
  "config show", // Print (decrypted) config file, or the config for a single remote.
  "config update", // Update options in an existing remote.
  "config userinfo", // Prints info about logged in user of remote.
  "copy", // Copy files from source to dest, skipping already copied.
  "copyto", // Copy files from source to dest, skipping already copied.
  "copyurl", // Copy url content to dest.
  "cryptcheck", // Cryptcheck checks the integrity of a crypted remote.
  "cryptdecode", // Cryptdecode returns unencrypted file names.
  "dedupe", // Interactively find duplicate filenames and delete/rename them.
  "delete", // Remove the contents of path.
  "deletefile", // Remove a single file from remote.
  "genautocomplete", // Output completion script for a given shell.
  "genautocomplete bash", // Output bash completion script for rclone.
  "genautocomplete fish", // Output fish completion script for rclone.
  "genautocomplete zsh", // Output zsh completion script for rclone.
  "gendocs", // Output markdown docs for rclone to the directory supplied.
  "hashsum", // Produces a hashsum file for all the objects in the path.
  "link", // Generate public link to file/folder.
  "listremotes", // List all the remotes in the config file.
  "ls", // List the objects in the path with size and path.
  "lsd", // List all directories/containers/buckets in the path.
  "lsf", // List directories and objects in remote:path formatted for parsing.
  "lsjson", // List directories and objects in the path in JSON format.
  "lsl", // List the objects in path with modification time, size and path.
  "md5sum", // Produces an md5sum file for all the objects in the path.
  "mkdir", // Make the path if it doesn't already exist.
  "mount", // Mount the remote as file system on a mountpoint.
  "move", // Move files from source to dest.
  "moveto", // Move file or directory from source to dest.
  "ncdu", // Explore a remote with a text based user interface.
  "obscure", // Obscure password for use in the rclone config file.
  "purge", // Remove the path and all of its contents.
  "rc", // Run a command against a running rclone.
  "rcat", // Copies standard input to file on remote.
  "rcd", // Run rclone listening to remote control commands only.
  "rmdir", // Remove the path if empty.
  "rmdirs", // Remove empty directories under the path.
  "serve", // Serve a remote over a protocol.
  "serve dlna", // Serve remote:path over DLNA
  "serve ftp", // Serve remote:path over FTP.
  "serve http", // Serve the remote over HTTP.
  "serve restic", // Serve the remote for restic's REST API.
  "serve sftp", // Serve the remote over SFTP.
  "serve webdav", // Serve remote:path over webdav.
  "settier", // Changes storage class/tier of objects in remote.
  "sha1sum", // Produces an sha1sum file for all the objects in the path.
  "size", // Prints the total size and number of objects in remote:path.
  "sync", // Make source and dest identical, modifying destination only.
  "touch", // Create new file or change file modification time.
  "tree", // List the contents of the remote in a tree like fashion.
  "version", // Show the version number.
];

COMMANDS.forEach(commandName => {
  // Normal API command to return a subprocess.
  Object.defineProperty(api, commandName, {
    /**
     * @param  {...string|object} args arguments for the API call
     * @returns {ChildProcess} the rclone subprocess.
     */
    value: function(...args) {
      return api(commandName, ...args);
    },
    enumerable: true,
  });

  // Promise API command to return a Promise.
  Object.defineProperty(promises, commandName, {
    /**
     * @param  {...string|object} args arguments for the API call
     * @returns {Promise<string>} the output of the command.
     */
    value: function(...args) {
      return promises(commandName, ...args);
    },
    enumerable: true,
  });
});

module.exports = api;

async function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });
  });
}
