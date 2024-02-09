"use client";

import { Api } from "@/app-specific/api";
import { useAppIndexedDB } from "@/app-specific/use-app-indexeddb";
import Query, { IQuery } from "@/components/Query";
import csvParser from "csv-parser";
import { useEffect, useRef, useState } from "react";
import { Readable } from "stream";

export default function Home() {
  const [sheetData, setSheetData] = useAppIndexedDB("sheetData", () => "");

  const [queries, setQueries] = useAppIndexedDB<IQuery[]>("queries", () => [
    { id: crypto.randomUUID(), enabled: true, value: "" },
  ]);
  const [result, setResult] = useState("");

  const [systemPrompt, setSystemPrompt] = useAppIndexedDB(
    "systemPrompt",
    () => "You are a helpful AI assistant."
  );

  const [apiIndex, setApiIndex] = useAppIndexedDB("apiIndex", () => 0);
  const [apis, setApis] = useAppIndexedDB<Api[]>("apis", () => [
    {
      name: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      key: "",
      models: [
        "gpt-3.5-turbo-0125",
        "gpt-3.5-turbo-0301",
        "gpt-3.5-turbo-0613",
        "gpt-3.5-turbo-1106",
        "gpt-3.5-turbo-16k-0613",
        "gpt-3.5-turbo-16k",
        "gpt-3.5-turbo-instruct-0914",
        "gpt-3.5-turbo-instruct",
        "gpt-3.5-turbo",
        "gpt-4-0125-preview",
        "gpt-4-0613",
        "gpt-4-1106-preview",
        "gpt-4-turbo-preview",
        "gpt-4-vision-preview",
        "gpt-4",
      ],
      selectedModel: "gpt-3.5-turbo",
    },
    {
      name: "OctoAI",
      url: "https://text.octoai.run/v1/chat/completions",
      key: "",
      models: [
        "codellama-7b-instruct-fp16",
        "llama-2-13b-chat-fp16",
        "llamaguard-7b-fp16",
        "mistral-7b-instruct-fp16",
        "mixtral-8x7b-instruct-fp16",
      ],
      selectedModel: "mixtral-8x7b-instruct-fp16",
    },
  ]);

  const [progress, setProgress] = useState<string | null>(null);

  const resultRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (
      resultRef.current &&
      resultRef.current.scrollTop + resultRef.current.clientHeight ===
        resultRef.current.scrollHeight
    ) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [result]);

  function processSheet() {
    const rows: any[] = [];

    Readable.from(sheetData)
      .pipe(csvParser())
      .on("data", (data) => rows.push(data))
      .on("end", async () => {
        setResult("");

        setProgress(`0/${rows.length}`);

        const lastEnabledQueryIdx = queries
          .map((query, index) => (query.enabled ? index : -1))
          .filter((index) => index !== -1)
          .at(-1);

        for (const [rowIdx, row] of Array.from(rows.entries())) {
          for (const [queryIdx, query] of Array.from(queries.entries())) {
            if (!query.enabled) {
              continue;
            }

            let finalQuery = query.value;

            for (const key in row) {
              finalQuery = finalQuery.replace(`{{${key}}}`, row[key]);
            }

            const response = await fetch(apis[apiIndex].url, {
              headers: {
                Authorization: `Bearer ${apis[apiIndex].key}`,
                "Content-Type": "application/json",
              },
              method: "POST",
              body: JSON.stringify({
                model: apis[apiIndex].selectedModel,

                messages: [
                  {
                    role: "system",
                    content: systemPrompt,
                  },
                  {
                    role: "user",
                    content: finalQuery,
                  },
                ],

                max_tokens: 128,
                presence_penalty: 0,
                temperature: 0.1,
                top_p: 0.9,
              }),
            });

            if (!response.ok) {
              throw new Error("HTTP error " + response.status);
            }

            const data = await response.json();

            setResult(
              (result) =>
                `${result}"${data.choices[0].message.content
                  .trim()
                  .replaceAll('"', '""')}"${
                  queryIdx === lastEnabledQueryIdx ? "\n" : "\t"
                }`
            );
          }

          setProgress(`${rowIdx + 1}/${rows.length}`);
        }
      });
  }

  return (
    <main>
      <div className="container mx-auto">
        <div className="p-4 flex flex-col">
          <div>CSV data with headers:</div>

          <textarea
            value={sheetData}
            onChange={(event) => setSheetData(event.target.value)}
            className="h-48 p-1 border border-black rounded-md resize-none bg-neutral-300"
          ></textarea>
        </div>

        <hr />

        <div className="p-4 flex flex-col">
          <div>
            Queries (use {"{{column}}"} to place column values):{" "}
            <button
              onClick={() => {
                setQueries((queries) => [
                  ...queries,
                  { id: crypto.randomUUID(), enabled: true, value: "" },
                ]);
              }}
              className="p-1 border border-black rounded-md bg-neutral-300"
            >
              +
            </button>
          </div>

          {queries.map((query, index) => (
            <Query
              enabled={query.enabled}
              text={query.value}
              onChange={(text) => {
                const newQueries = [...queries];
                newQueries[index].value = text;
                setQueries(newQueries);
              }}
              onToggleEnabled={(enabled) => {
                const newQueries = [...queries];
                newQueries[index].enabled = enabled;
                setQueries(newQueries);
              }}
              onDelete={() => {
                if (queries.length === 1) {
                  return;
                }

                const newQueries = [...queries];
                newQueries.splice(index, 1);
                setQueries(newQueries);
              }}
              key={index}
            />
          ))}

          <div className="h-4"></div>

          <div className="flex flex-col">
            <div>System prompt:</div>

            <textarea
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              className="h-32 p-1 border border-black rounded-md resize-none bg-neutral-300"
            />
          </div>
        </div>

        <hr />

        <div className="p-4 flex flex-col">
          <div className="flex flex-col">
            <div>API:</div>

            <select
              className="p-1 border border-black rounded-md bg-neutral-300"
              value={apiIndex}
              onChange={(event) => setApiIndex(parseInt(event.target.value))}
            >
              {apis.map((api, index) => (
                <option key={index} value={index}>
                  {api.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h-2"></div>

          <div className="flex flex-col">
            <div>API URL:</div>

            <input
              type="text"
              value={apis[apiIndex].url}
              onChange={(event) => {
                const newApis = [...apis];
                newApis[apiIndex].url = event.target.value;
                setApis(newApis);
              }}
              className="p-1 border border-black rounded-md resize-none bg-neutral-300"
            />
          </div>

          <div className="h-2"></div>

          <div className="flex flex-col">
            <div>API key:</div>

            <input
              type="password"
              value={apis[apiIndex].key}
              onChange={(event) => {
                const newApis = [...apis];
                newApis[apiIndex].key = event.target.value;
                setApis(newApis);
              }}
              className="p-1 border border-black rounded-md resize-none bg-neutral-300"
            />
          </div>

          <div className="h-2"></div>

          <div className="flex flex-col">
            <div>Model:</div>

            <select
              className="p-1 border border-black rounded-md bg-neutral-300"
              value={apis[apiIndex].selectedModel}
              onChange={(event) => {
                const newApis = [...apis];
                newApis[apiIndex].selectedModel = event.target.value;
                setApis(newApis);
              }}
            >
              {apis[apiIndex].models.map((model, index) => (
                <option key={index} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <div className="h-6"></div>

          <button
            className="p-2 bg-neutral-300 rounded-md"
            onClick={processSheet}
          >
            Process data
          </button>
        </div>

        <hr />

        <div className="p-4 flex flex-col">
          <div>Result{progress ? ` (${progress})` : ""}:</div>

          <textarea
            ref={resultRef}
            readOnly
            value={result}
            className="h-48 p-1 border border-black rounded-md resize-none bg-neutral-300"
            placeholder="Process the data to see the result here."
          ></textarea>
        </div>
      </div>
    </main>
  );
}
