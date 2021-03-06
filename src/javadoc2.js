module.exports = {
  generate: function generate(optionsArg) {
    let options = undefined;
    let isTestClass = false;
    let isDeprecatedClass = false;

    const CLASS_TYPES = [`Class`, `Interface`];
    const CLASS_AND_ENUM_TYPES = [`Class`, `Interface`, `Enum`];
    const HIDDEN_TAGS = [`@exclude`, `@hidden`];

    const REGEX_STRING = /([\"'`])(?:[\s\S])*?(?:(?<!\\)\1)/gm;
    const REGEX_JAVADOC = /\/\*\*(?:[^\*]|\*(?!\/))*.*?\*\//gm;
    const REGEX_ATTRIBUTES = /(?:\@[^\n]*[\s]+)*/gm;
    const REGEX_WS = /\s*/;
    const REGEX_NBWS = /[ \t]*/;
    const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
    const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
    const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;
    const REGEX_JAVADOC_CODE_BLOCK = /{@code((?:\s(?!(?:^}))|\S)*)\s*}/gm;
    const REGEX_ACCESSORS = /^[ \t]*(global|public|private)/g;

    const REGEX_CLASS_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      REGEX_ACCESSORS.source +
      /\s*([\w\s]*)\s+(class|enum|interface)+\s*([\w]+)\s*((?:extends)* [^\n]*)*\s*{/.source,
      'gm'
    );
    const REGEX_CLASS = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_CLASS_NODOC.source, 'gm');

    const REGEX_ABSTRACT_METHOD_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      /^[ \t]*()()(?!return)([\w\<\>\[\]\,\. ]*)[ \t]+(?!for)([\w]+)[ \t]*(\([^\)]*\))\s*;/.source,
      'gm'
    )
    const REGEX_ABSTRACT_METHOD = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_ABSTRACT_METHOD_NODOC.source, 'gm');

    const REGEX_METHOD_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      REGEX_ACCESSORS.source +
      /[ \t]*([\w]*)[ \t]+([\w\<\>\[\]\,\. ]*)[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:{|;)/.source,
      'gm'
    );
    const REGEX_METHOD = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_METHOD_NODOC.source, 'gm');

    const REGEX_CONSTRUCTOR_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      REGEX_ACCESSORS.source +
      /[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:[{])/.source,
      'gm'
    );
    const REGEX_CONSTRUCTOR = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_CONSTRUCTOR_NODOC.source, 'gm');

    const REGEX_PROPERTY_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      REGEX_ACCESSORS.source +
      /\s*(static|final|const)*\s+([\w\s\[\]<>,]+)\s+([\w]+)\s*(?:{\s*get([^}]+)}|(?:=[\w\s\[\]<>,{}'=()]*)|;)+/.source,
      'gm'
    );
    const REGEX_PROPERTY = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_PROPERTY_NODOC.source, 'gm');

    const STR_TODO = "TODO: No valid documentation currently exists for this _ENTITY_.";

    const ENTITY_TYPE = {
      CLASS: 1,
      METHOD: 2,
      PROPERTY: 3,
      CONSTRUCTOR: 4
    }

    ///// Main /////////////////////////////////////////////////////////////////////////////////////////////////////////
    return (function () {
      normalizeOptions();
      let raw = iterateFiles();
      let data = formatOutput(raw);
      return data;
    })();

    ///// Normalize Options ////////////////////////////////////////////////////////////////////////////////////////////
    function normalizeOptions() {
      ///// Normalize arguments:
      options = Object.assign({
        include: ["**/*.cls"],
        exclude: ["**/node_modules/**/*"],
        output: undefined,
        format: "markdown",
        accessors: ["global"],
        debug: "false"
      }, optionsArg);
      hasOutput = options.output;
      ///// Negate all the excluded patterns:
      options.exclude = [].concat(options.exclude).map(function (item) {
        if (item.charAt(0) === ("!")) {
          return item;
        }
        return "!" + item;
      });
    };

    ///// Parse File ///////////////////////////////////////////////////////////////////////////////////////////////////
    function parseFile(text, lang) {
      let fileData = [];
      let classData = [];
      let classes = [];
      let allClasses = []; // Includes private and other classes so we can remove them from the parent body
      let i = 0;

      classData = merge(
        matchAll(text, REGEX_CLASS, true),
        matchAll(text, REGEX_CLASS_NODOC, true),
        4,
        4
      );

      ///// All classes
      classData.forEach(function(data) {
        let c = getClass(data);
        allClasses.push(c);
      });

      ///// Filtered classes
      classData = filter(classData);
      __LOG__("Classes = " + classData.length);

      classData.forEach(function(data) {
        let c = getClass(data);
        classes.push(c);
      });

      classes = setClassBodyCodeOnly(allClasses);
      classes = setLevels(classes);
      classes = setClassPaths(classes); //.sort(ClassComparator);

      classData.forEach(function(data) {
        let parsedClass = parseData([data], ENTITY_TYPE.CLASS, classes[i]);
        __LOG__("Class = " + classes[i].path);
        if (fileData.length === 0) {
          fileData = parsedClass;
        } else {
          fileData = fileData.concat(parsedClass);
        }
        let members = parseClass(classes[i], lang);
        if (members !== undefined) fileData = fileData.concat(members);
        i++;
      });

      return fileData;
    }

    ///// Parse Class //////////////////////////////////////////////////////////////////////////////////////////////////
    function parseClass(target, lang) {
      let children = [];
      let classType = target.name.toLowerCase(); // Class, Enum, Interface, etc.

      ///// Handle Properties
      let propertyData = merge(
        matchAll(target.bodyCodeOnly, REGEX_PROPERTY, true),
        matchAll(target.bodyCodeOnly, REGEX_PROPERTY_NODOC, true),
        4,
        4
      );
      propertyData = filter(propertyData, lang, classType);
      __LOG__("Properties = " + propertyData.length);

      if (propertyData.length > 0) {
        children = children.concat(parseData(propertyData, ENTITY_TYPE.PROPERTY));
      }

      ///// Handle Constructors
      let constructorData = merge(
        matchAll(target.bodyCodeOnly, REGEX_CONSTRUCTOR, true),
        matchAll(target.bodyCodeOnly, REGEX_CONSTRUCTOR_NODOC, true),
        4,
        4
      );
      constructorData = filter(constructorData, lang, classType);
      __LOG__("Constructors = " + constructorData.length);

      if (constructorData.length > 0) {
        children = children.concat(parseData(constructorData, ENTITY_TYPE.CONSTRUCTOR));
      }

      ///// Handle Abstract Methods
      let abstractData = merge(
        matchAll(target.bodyCodeOnly, REGEX_ABSTRACT_METHOD, true),
        matchAll(target.bodyCodeOnly, REGEX_ABSTRACT_METHOD_NODOC, true),
        4,
        4
      );
      abstractData = filter(abstractData, lang, classType);
      __LOG__("Abstract Methods = " + abstractData.length);

      if (abstractData.length > 0) {
        children = children.concat(parseData(abstractData, ENTITY_TYPE.METHOD));
      }

      ///// Handle Methods
      let methodData = merge(
        matchAll(target.bodyCodeOnly, REGEX_METHOD, true),
        matchAll(target.bodyCodeOnly, REGEX_METHOD_NODOC, true),
        4,
        4
      );
      methodData = filter(methodData, lang, classType);
      __LOG__("Methods = " + methodData.length);

      if (methodData.length > 0) {
        children = children.concat(parseData(methodData, ENTITY_TYPE.METHOD));
      }

      return children;
    };

    ///// Parse Data ///////////////////////////////////////////////////////////////////////////////////////////////////
    function parseData(javadocData, entityType, header) {
      let javadocFileDataLines = [];

      javadocData.forEach(function (data) {
        let lastObject = {
          name: "default",
          text: ""
        };
        let javadocCommentData = [];

        if (entityType === ENTITY_TYPE.CLASS) {
          if (data[0].includes('@IsTest')) {
            isTestClass = true;
            return;
          }
          ///// This property tracks whether the entire class is deprecated, versus the specific entity
          isDeprecatedClass = data[0].includes(`@Deprecated`) && header.level === 0;
        }

        ///// Skip test entities
        if (
          (data[0].indexOf('@IsTest') !== -1 || isTestClass || isDeprecatedClass) &&
          entityType !== ENTITY_TYPE.CLASS) {
            return;
        }
        let entityHeader = header === undefined ? getEntity(data, entityType) : header;

        ///// Skip invalid entities, or entities that have non-included accesors (see getEntity() method)
        if (entityHeader === undefined) return;

        ///// Process Javadocs, if any
        if (data[0].match(REGEX_JAVADOC) !== null) {
          let javadocCommentClean = "\n" + data[0].split("*/")[0].replace(REGEX_BEGINING_AND_ENDING, "");
          let javadocLines = javadocCommentClean.split(REGEX_JAVADOC_LINE_BEGINING);
          let attributeMatch = "default";

          javadocLines.forEach(function (javadocLine) {
            let attrMatch = javadocLine.match(REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE);
            let isNewMatch = (!!attrMatch);
            if (isNewMatch) {
              attributeMatch = attrMatch[0].replace(/_/g, " ");
            }
            if (isNewMatch) {
              javadocCommentData.push(lastObject);
              lastObject = {
                name: attributeMatch,
                text: javadocLine.replace(REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE, "")
                  .replace(/^ /g, "")
                  .replace(/(\*)( )+(\/)/g, function (match) {
                    return match.substr(0, 1) + match.substr(1, match.length - 3) + match.substr(match.length - 1);
                  })
              };
            } else {
              lastObject.text += "\n" + javadocLine
                .replace(/^ /g, "")
                .replace(/(\*)( )+(\/)/g, function (match) {
                  return match.substr(0, 1) + match.substr(1, match.length - 3) + match.substr(match.length - 1);
                });
            }
          });
          lastObject.text = lastObject.text.replace(/\/\*\*( )*/g,``);
          javadocCommentData.push(lastObject);
        } else {
          if (entityHeader.isJavadocRequired && !entityHeader.isDeprecated) {
            javadocCommentData.push({ name: "todo", text: STR_TODO.replace("_ENTITY_", entityHeader.name) });
          }
        }
        ///// Javadocs are pushed onto the stack after the header for all entity types except: Property, Enum
        if (entityType != ENTITY_TYPE.PROPERTY && entityHeader.name != "enum") {
          javadocFileDataLines.push([entityHeader]);
          javadocFileDataLines.push(javadocCommentData);
        } else {
          ///// For Property & Enum entities, add the javadoc as the descrip
          if (javadocCommentData[0] && !entityHeader.isDeprecated)
            entityHeader.descrip = javadocCommentData[0].text;

            javadocFileDataLines.push([entityHeader]);
        }
      });
      return javadocFileDataLines;
    }

    ///// Format Output ////////////////////////////////////////////////////////////////////////////////////////////////
    function formatOutput(docComments) {
      const fs = require("fs");
      const path = require("path");
      const mkdirp = require('mkdirp');
      let data = undefined;
      if (options.format === "markdown") {
        let tocData = "";
        data = "";
        for (let file in docComments) {
          let docCommentsFile = docComments[file];
          let firstProp = true;
          let firstParam = true;
          let isMethod = false;
          let parentName;
          for (let a = 0; a < docCommentsFile.length; a++) {
            let cdataList = docCommentsFile[a];
            if (cdataList === null || cdataList === undefined) break;
            for (let b = 0; b < cdataList.length; b++) {
              (function (cdata) {
                ///// Stage the data
                let entityType = cdata[b].name === undefined ? "" : cdata[b].name.replace(/^@/g, "");
                let text = cdata[b].text === undefined ? "" : cdata[b].text.replace(/\n/gm, " ").trim();
                let entitySubtype = cdata[b].type === undefined ? "" : cdata[b].type.replace(/\n/gm, " ");
                let entityName = cdata[b].toc === undefined ? "" : cdata[b].toc.replace(/\n/gm, " ");
                let classPath = cdata[b].path === undefined ? "" : cdata[b].path.replace(/\n/gm, " ");
                let body = cdata[b].body === undefined ? "" : cdata[b].body;
                let descrip = cdata[b].descrip === undefined ? "" : cdata[b].descrip.replace(/\n/gm, " ").trim();
                let codeBlock = matchAll(cdata[b].text, REGEX_JAVADOC_CODE_BLOCK);
                let isDeprecated = cdata[b].isDeprecated || (isDeprecatedClass && cdata[b].level > 0);
                let deprecated =  isDeprecated ? ` *deprecated*` : ``;

                ///// Propercase entityType
                if (entityType.length) {
                  entityType = entityType[0].toUpperCase() + entityType.substr(1);
                }
                if (CLASS_TYPES.includes(entityType)) {
                  firstProp = true;
                  isMethod = false;
                  parentName = entityName;
                }
                if (entityType === `Method`) {
                  firstParam = true;
                  isMethod = true;
                  parentName = entityName;
                }

                ///// Code Blocks
                if (codeBlock.length > 0 && codeBlock[0] !== undefined) {
                  codeBlock.forEach(function(block) {
                    text = text.replace(block[0].replace(/\n/gm, ` `),
                      "\n##### Example:\n```" + getLang(file) + undentBlock(block[1]) + "```\n"
                    );
                  });
                }

                ///// Classes, Enum & Interface types
                if (CLASS_AND_ENUM_TYPES.includes(entityType)) {
                  entityType = entityType.toLowerCase();
                  tocData += (`\n1. [${classPath} ${entityType}](#${classPath.replace(/\s/g, "-")}-${entityType}) ${deprecated}`);
                  text = `${classPath} ${entityType}${deprecated}`;
                  text = `\n---\n### ${text}`;

                  ///// Enum values
                  if (entityType === 'enum' && body !== undefined) {
                    text += `\n${descrip}`;
                    text += '\n\n|Values|\n|:---|';
                    getEnumBody(body).forEach(function (enumText) {
                      text += `\n|${enumText}|`
                    });
                  }

                ///// Methods
                } else if (entityType === 'Method') {
                  tocData += (`\n   * ${escapeAngleBrackets(entityName)}${deprecated}`);
                  text = `#### ${escapeAngleBrackets(text)}${deprecated}`;

                ///// Parameters
                } else if (entityType === "Param") {
                  let pname = text.substr(0, text.indexOf(" "));
                  let descrip = text.substr(text.indexOf(" "));
                  if (isMethod) {
                    if (firstParam) {
                      data += '\n##### Parameters:\n\n|Name|Description|\n|:---|:---|\n';
                      firstParam = false;
                    }
                    text = `|${pname}${deprecated}|${descrip}|`;
                  } else {
                    text = `* TODO: Parameter ${pname} defined in class Javadoc; move to method or constructor.`;
                  }

                ///// Return values
                } else if (entityType === "Return") {
                  if (isMethod) {
                    text = '\n##### Return value:\n\n' + text;
                  } else {
                    text = `* TODO: Return value defined in class Javadoc, but should not be.`;
                  }

                ///// Properties
                } else if (entityType === "Property") {
                  if (firstProp) {
                    data += '\n#### Properties\n\n|Static?|Type|Property|Description|' +
                      '\n|:---|:---|:---|:---|\n';
                    firstProp = false;
                  }
                  let static = cdata[b].static ? "Yes" : " ";
                  descrip = descrip.replace(/\/\*\*/g, '');
                  text = `|${static}|${entitySubtype}|${text}|${descrip}${deprecated}|`;
                } else if (entityType === "Author") {
                  text = "";
                }
                data += `${text}\n`;
              })(cdataList);
            }
          }
          data += "\n";
        }
        /////File header
        data = "# API Reference\n" + tocData + "\n" + data;
      } else {
        data = JSON.stringify(docComments, null, 4);
      }

      if (options.output === undefined) {
        console.log(data);

      ///// Write out to the specified file
      } else {
        __LOG__("Writing results to: " + options.output);
        let folder = path.dirname(options.output);
        if (fs.existsSync(folder)) {
          if (fs.lstatSync(folder).isDirectory()) {
            fs.writeFileSync(options.output, data, "utf8");
          } else {
            throw {
              name: "DumpingResultsError",
              message: "Destination folder is already a file"
            };
          }
        } else {
          mkdirp.sync(folder);
          fs.writeFileSync(options.output, data, "utf8");
        }
      }
      return data;
    };

    ///// Iterate Files ////////////////////////////////////////////////////////////////////////////////////////////////
    function iterateFiles() {
      const globule = require("globule");
      const fs = require("fs");
      let docComments = {};
      __LOG__("Starting.");
      __LOG__("Files:", options.include);
      __LOG__("Excluded:", options.exclude);
      __LOG__("Output:", options.output);
      __LOG__("Format:", options.format);
      __LOG__("Accessors:", options.accessors);
      __LOG__("Debug:", options.debug);
      const files = globule.find([].concat(options.include).concat(options.exclude));
      __LOG__("Files found: " + files.length);
      for (let a = 0; a < files.length; a++) {
        let file = files[a];
        let lang = getLang(file);
        __LOG__(`File: ${file} Lang: ${lang}`);
        let contents = fs.readFileSync(file).toString();
        let javadocMatches = parseFile(contents, lang);
        if (javadocMatches.length !== 0) {
          docComments[file] = javadocMatches;
        }
      }
      return docComments;
    };

    ///// Utility Methods //////////////////////////////////////////////////////////////////////////////////////////////
    function getEnumBody(str) {
      let ret = [];
      if (str === undefined) return ret;
      str = str.replace(/[\s\n]/g,'');
      str = str.substring(str.indexOf(`{`)+1, str.indexOf(`}`));
      ret = str.split(`,`);
      return ret;
    }

    function matchAll(str, regexp, excludeComments) {
      let ret = [];
      let result = undefined;
      let i = 0;
      let nojavadocs = str.replace(REGEX_JAVADOC, ``).replace(/\/\/.*/g, ``);
      while (result = regexp.exec(str)) {
        if (nojavadocs.includes(result[0]) ||
          result[0].trim().substring(0,3) === `/**` ||
          !excludeComments
          ) {
          ret.push(result);
        }
      }
      return ret;
    }

    function filter(data, lang, parentType) {
      data = filterByAccessors(data, lang, parentType);
      data = filterByHidden(data, lang, parentType);
      return data;
    }

    function filterByAccessors(data, lang, parentType) {
      let ret = [];
      data.forEach(function (target) {
        // Include type if * is specified in accessor args
        if (options.accessors.includes(`*`)) ret.push(target);
        // Include type if accessor is in args
        if (options.accessors.includes(target[1])) ret.push(target);
        // Include child classes for apex if no accessor is specified
        if (parentType === `interface` && lang === `apex` && isEmpty(target[1])) ret.push(target);
      });
      if (ret.length < data.length)
        __DBG__(`Filtered out ${data.length - ret.length} types based on accessors (` + options.accessors + `).`);
      return ret;
    }

    function filterByHidden(data) {
      let ret = [];
      data.forEach(function (target) {
        if (!isHidden(target)) ret.push(target);
      });
      if (ret.length < data.length)
        __DBG__(`Filtered out ${data.length - ret.length} types which are @hidden.`);
      return ret;
    }

    function isHidden(data) {
      let ret = false;
      let jd = data[0].match(REGEX_JAVADOC);
      if (jd === null) return false;
      HIDDEN_TAGS.forEach(function(tag) {
        if (jd[0].toLowerCase().includes(tag)) {
          ret = true;
          return;
        }
      });
      return ret;
    }

    function merge(data1, data2, key1, key2) {
      let keys = [];
      data1.forEach(function (item) {
        keys.push(item[key1]);
      });
      data2.forEach(function (item) {
        if (!keys.includes(item[key2])) {
          data1.push(item);
        }
      });
      return data1;
    }

    function EntityComparator(a, b) {
      if (a[4] < b[4]) return -1;
      if (a[4] > b[4]) return 1;
      return 0;
    }

    function ClassComparator(a, b) {
      if (a.toc < b.toc) return -1;
      if (a.toc > b.toc) return 1;
      return 0;
    }

    function getEntity(data, entityType) {
      let ret = undefined;
      if (entityType === ENTITY_TYPE.CLASS) ret = getClass(data);
      if (entityType === ENTITY_TYPE.METHOD) ret = getMethod(data);
      if (entityType === ENTITY_TYPE.PROPERTY) ret = getProp(data);
      if (entityType === ENTITY_TYPE.CONSTRUCTOR) ret = getConstructor(data);
      return ret;
    }

    function getProp(data) {
      let ret = {
        name: "Property",
        accessor: data[1],
        toc: data[4],
        text: data[4],
        type: data[3],
        descrip: "",
        static: data[2] === "static",
        line: getLineNumber(data),
        start: data.index,
        isDeprecated: (data[0].includes(`@Deprecated`)),
        isJavadocRequired: true,
        isExclude: isHidden(data)
      };
      return ret;
    }

    function getMethod(data) {
      data[2] = data[2] === "override" ? "" : data[2];
      let ret = {
        name: "Method",
        accessor: data[1],
        toc: data[4] + data[5],
        text: data[2] + ' ' +
          data[3] + ' ' +
          data[4] +
          data[5],
        line: getLineNumber(data),
        start: data.index,
        isDeprecated: (data[0].includes(`@Deprecated`)),
        isJavadocRequired: true,
        isExclude: isHidden(data)
      };
      return ret;
    }

    function getConstructor(data) {
      let ret = {
        name: "Method",
        accessor: data[1],
        toc: data[2] + data[3],
        text: data[2] + data[3],
        line: getLineNumber(data),
        start: data.index,
        isDeprecated: (data[0].includes(`@Deprecated`)),
        isJavadocRequired: true,
        isExclude: isHidden(data)
      };
      return ret;
    }

    function getClass(data) {
      let endIndex = getEndIndex(data);
      let ret = {
        name: data[3], // Class, Enum, Interface, etc.
        accessor: data[1],
        toc: data[4],
        text: data[4],
        body: data.input.substring(data.index, endIndex), // data.index is from the regex matching object
        bodyCodeOnly: undefined,
        line: getLineNumber(data),
        signature: (data[1] + " " + data[2] + " " + data[3] + " " + data[4]).replace(`  `, ` `) + " ",
        start: data.index,
        end: endIndex,
        path: ``,
        descrip: ``,
        level: undefined,
        isDeprecated: (data[0].includes(`@Deprecated`)),
        isJavadocRequired: (data[3] !== `enum` && (!data[5] || data[5].includes(`exception`))),
        isExclude: isHidden(data)
      };
      return ret;
    }

    function setLevels(classes) {
      classes.forEach(function(cur) {
        cur.level = recLevel(cur, classes.slice(0), 0);
      });
      return classes;
    }

    function recLevel(target, classes, level) {
      classes.forEach(function(cur) {
        if (target !== cur) {
          let isChild = cur.body.includes(target.signature);
          if (isChild) {
            level = recLevel(cur, classes, level + 1);
          } else {
            classes = classes.splice(classes.indexOf(target), 1);
          }
        }
      });
      return level;
    }

    function setClassPaths(classes) {
      classes.forEach(function(cur) {
        cur.path = recPath(cur, cur.path, classes.slice(0)) + cur.toc;
      });
      return classes;
    }

    function recPath(target, path, classes) {
      classes.forEach(function(cur) {
        if (target !== cur) {
          let isChild = cur.body.includes(target.signature);
          if (isChild) {
            path += recPath(cur, cur.toc, classes) + ".";
          } else {
            classes = classes.splice(classes.indexOf(target), 1);
          }
        }
      });
      return path;
    }

    /**
     * For all classes, puts the class definition stripped of all sub-class definitions into a field on the class
     * @param {*} classes
     */
    function setClassBodyCodeOnly(classes) {
      classes.forEach(function(target) {
        target.bodyCodeOnly = target.body;
        classes.forEach(function(cur) {
          if (target !== cur) {
            let isChild = target.body.includes(cur.signature);
            if (isChild) {
              target.bodyCodeOnly = target.bodyCodeOnly.replace(cur.body, ``);
            }
          }
        });
      });
      return classes;
    }

    function getLineNumber(data) {
      if (data.index === 0) return 1;
      let codeBlock = data.input.substr(0, data.index);
      let lineNum = (codeBlock.match(/\n/g || []).length) + 1;
      return lineNum;
    }

    function getEndIndex(data) {
      let codeBlock = data.input.substring(data.index, data.input.length);
      ///// Replace comment bodies with spaces to prevent non-code matches, while still keeping the indexes the same
      codeBlock = codeBlock.replace(REGEX_JAVADOC, function(match, p1) {
        return "/**" + "".padStart(match.length - 5) + "*/";
      });
      ///// Replace string literals with spaces to prevent non-code matches, while still keeping the indexes the same
      codeBlock = codeBlock.replace(REGEX_STRING, function(match, p1) {
        return p1 + "".padStart(match.length - 2) + p1;
      });
      let ob = 0;
      let cb = 0;
      let endIndex = undefined;
      for(let i = 0; i < codeBlock.length; i++) {
        if (codeBlock.charAt(i) === "{") ob++;
        if (codeBlock.charAt(i) === "}") cb++;
        if (ob !== 0 && cb !== 0 && ob === cb) {
          endIndex = i + data.index + 1;
          break;
        };
      }
      codeBlock = data.input.substring(data.index, endIndex);
      return endIndex;
    }

    function escapeAngleBrackets(str) {
      return str.replace(/([\<\>])/g, function (match) {
        return `\\${match}`
      });
    }

    function getLang(file) {
      if (file.substr(file.length - 4, file.length) === ".cls") return "apex";
    }

    function undentBlock(block) {
      let REGEX_INDEX = /^[ \t]*\**[ \t]+/g;
      let indent = null;
      block.split("\n").forEach(function (line) {
        let match = line.match(REGEX_INDEX);
        let cur = match !== null ? match[0].length : null;
        if (cur < indent || indent === null) indent = cur;
      });
      let ret = "";
      block.split("\n").forEach(function (line) {
        line = undent(line, indent);
        ret += line;
      });
      return ret;
    }

    function undent(str, remove) {
      let ret = "";
      let count = 0;
      for (let i = 0; i < str.length; i++) {
        let c = str.charAt(i);
        if ((c === " ") && count < remove) {
          count++;
        } else {
          break;
        }
      }
      ret = str.substr(count, str.length);
      if (ret === "\n" || ret === " ") ret;
      return ret + "\n";
    }

    function isEmpty(str) {
      if (str === null || str === undefined) return true;
      if (str.trim() == ``) return true;
      return false;
    }

    function __DBG__(msg) {
      if (options.debug == `true`) {
        let otherArgs = Array.prototype.slice.call(arguments);
        otherArgs.shift();
        console.log.apply(console, ["[DEBUG] " + msg].concat(otherArgs));
      }  
    }

    function __LOG__(msg) {
      if (options.output === undefined) {
        return;
      }
      let otherArgs = Array.prototype.slice.call(arguments);
      otherArgs.shift();
      console.log.apply(console, ["[javadoc2] " + msg].concat(otherArgs));
    }
  }
}