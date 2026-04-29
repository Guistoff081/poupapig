<script setup lang="ts">
import { DialogFooter } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { fuzzyMatchCategory } from "~/utils/fuzzy-category"
import { getFetchErrorMessage } from "~/utils/fetch-error"
import { formatMoneyInputBr, parseMoneyInputBr } from "~/utils/money-input"

type ExtractedRow = {
  amount: number
  date: string
  type: "income" | "expense"
  description: string | null
  suggestedCategory: string | null
}

type PreviewRow = {
  amount: string
  date: string
  type: "income" | "expense"
  description: string
  categoryId: string | undefined
  error?: string
}

const emit = defineEmits<{
  (e: "submit"): void
  (e: "cancel"): void
}>()

const MAX_FILE_BYTES = 8 * 1024 * 1024

const categoriesStore = useCategoriesStore()
const { categories } = storeToRefs(categoriesStore)

const step = ref<"upload" | "extracting" | "review">("upload")
const isSaving = ref(false)
const filename = ref("")
const dataUrl = ref("")
const rows = ref<PreviewRow[]>([])
const isDragging = ref(false)

let abortController: AbortController | null = null

const typeOptions = [
  { label: "Receita", value: "income" },
  { label: "Despesa", value: "expense" },
]

function categoryOptionsFor(type: "income" | "expense") {
  return categories.value
    .filter(c => c.type === type)
    .map(c => ({ label: c.name, value: c.id }))
}

function onTypeChange(row: PreviewRow, newType: string | undefined) {
  row.type = (newType ?? "expense") as "income" | "expense"
  row.categoryId = undefined
}

const totalRows = computed(() => rows.value.length)
const failedRows = computed(() => rows.value.filter(r => r.error).length)

function seedRows(extracted: ExtractedRow[]) {
  rows.value = extracted.map(e => ({
    amount: formatMoneyInputBr(e.amount),
    date: e.date,
    type: e.type,
    description: e.description ?? "",
    categoryId: fuzzyMatchCategory(e.suggestedCategory, e.type, categories.value) ?? undefined,
    error: undefined,
  }))
}

async function processFile(file: File) {
  if (file.size > MAX_FILE_BYTES) {
    useToast({
      type: "error",
      title: "Arquivo muito grande",
      description: "O arquivo deve ter no máximo 8 MB.",
    })
    return
  }

  const mime = file.type
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
  if (!allowed.includes(mime)) {
    useToast({
      type: "error",
      title: "Formato inválido",
      description: "Envie JPG, PNG, WebP ou PDF.",
    })
    return
  }

  filename.value = file.name
  step.value = "extracting"

  const reader = new FileReader()
  reader.readAsDataURL(file)
  reader.onload = async () => {
    dataUrl.value = reader.result as string
    await runExtraction()
  }
  reader.onerror = () => {
    step.value = "upload"
    useToast({
      type: "error",
      title: "Erro ao ler arquivo",
      description: "Não foi possível ler o arquivo selecionado.",
    })
  }
}

async function runExtraction() {
  abortController = new AbortController()
  try {
    if (categories.value.length === 0) {
      await categoriesStore.getCategories()
    }

    const result = await $fetch<{ transactions: ExtractedRow[] }>(
      "/api/transactions/extract",
      {
        method: "POST",
        body: { dataUrl: dataUrl.value, filename: filename.value },
        signal: abortController.signal,
      },
    )

    seedRows(result.transactions ?? [])
    step.value = "review"
  }
  catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError")
      return
    step.value = "upload"
    useToast({
      type: "error",
      title: "Erro na extração",
      description: getFetchErrorMessage(err, "Não foi possível analisar o documento."),
    })
  }
  finally {
    abortController = null
  }
}

function cancelExtraction() {
  abortController?.abort()
  step.value = "upload"
}

function onFileInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file)
    processFile(file)
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (file)
    processFile(file)
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

async function save() {
  if (isSaving.value || rows.value.length === 0)
    return

  const payload = rows.value.map(r => ({
    amount: parseMoneyInputBr(r.amount),
    category_id: r.categoryId ?? null,
    date: r.date,
    description: r.description.trim() || null,
    type: r.type,
  }))

  isSaving.value = true
  rows.value.forEach(r => (r.error = undefined))

  try {
    const result = await $fetch<{
      inserted: number
      failed: Array<{ index: number; error: string }>
    }>("/api/transactions/batch", {
      method: "POST",
      body: { transactions: payload },
    })

    const failedIndexes = new Set(result.failed.map(f => f.index))
    result.failed.forEach(f => {
      if (rows.value[f.index])
        rows.value[f.index]!.error = f.error
    })

    const toRemove = rows.value
      .map((_, i) => i)
      .filter(i => !failedIndexes.has(i))

    for (let i = toRemove.length - 1; i >= 0; i--) {
      rows.value.splice(toRemove[i]!, 1)
    }

    if (result.inserted > 0 && result.failed.length === 0) {
      useToast({
        type: "success",
        title: "Importação concluída",
        description: `${result.inserted} transação(ões) importada(s) com sucesso.`,
      })
      emit("submit")
    }
    else if (result.inserted > 0) {
      useToast({
        type: "error",
        title: "Importação parcial",
        description: `${result.inserted} importada(s), ${result.failed.length} com erro. Corrija e tente novamente.`,
      })
    }
    else {
      useToast({
        type: "error",
        title: "Erro na importação",
        description: `${result.failed.length} transação(ões) com erro. Verifique os dados e tente novamente.`,
      })
    }
  }
  catch (err) {
    useToast({
      type: "error",
      title: "Erro",
      description: getFetchErrorMessage(err, "Falha ao salvar transações."),
    })
  }
  finally {
    isSaving.value = false
  }
}

function retryUpload() {
  rows.value = []
  step.value = "upload"
}
</script>

<template>
  <!-- Upload step -->
  <div v-if="step === 'upload'" class="space-y-4">
    <div
      class="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors"
      :class="isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop="onDrop"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <Icon name="lucide:file-scan" class="text-muted-foreground size-10" />
      <div>
        <p class="font-medium">Arraste ou clique para selecionar</p>
        <p class="text-muted-foreground text-sm">JPG, PNG, WebP ou PDF — máx. 8 MB</p>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
        class="hidden"
        @change="onFileInput"
      />
    </div>
    <DialogFooter>
      <Button variant="outline" type="button" @click="emit('cancel')">Cancelar</Button>
    </DialogFooter>
  </div>

  <!-- Extracting step -->
  <div v-else-if="step === 'extracting'" class="space-y-4">
    <div class="flex flex-col items-center justify-center gap-4 py-8">
      <Icon name="lucide:loader-circle" class="text-primary size-10 animate-spin" />
      <div class="text-center">
        <p class="font-medium">Analisando documento...</p>
        <p class="text-muted-foreground max-w-xs truncate text-sm">{{ filename }}</p>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" type="button" @click="cancelExtraction">Cancelar</Button>
    </DialogFooter>
  </div>

  <!-- Review step -->
  <div v-else-if="step === 'review'" class="space-y-4">
    <!-- Empty result -->
    <div
      v-if="totalRows === 0"
      class="flex flex-col items-center justify-center gap-3 py-8 text-center"
    >
      <Icon name="lucide:file-search" class="text-muted-foreground size-10" />
      <p class="font-medium">Nenhuma transação identificada</p>
      <p class="text-muted-foreground text-sm">
        Tente uma imagem mais nítida ou um extrato em formato PDF.
      </p>
      <Button variant="outline" size="sm" @click="retryUpload">Tentar outro arquivo</Button>
    </div>

    <!-- Rows table -->
    <template v-else>
      <div v-if="failedRows > 0" class="text-destructive text-sm font-medium">
        {{ failedRows }} linha(s) com erro — corrija e importe novamente.
      </div>
      <div class="max-h-[55vh] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-36">Data</TableHead>
              <TableHead class="w-28">Tipo</TableHead>
              <TableHead class="w-32 text-right">Valor</TableHead>
              <TableHead class="w-40">Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead class="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="(row, i) in rows"
              :key="i"
              :class="row.error ? 'bg-destructive/10' : ''"
            >
              <TableCell class="py-1">
                <shared-date-input v-model="row.date" :disabled="isSaving" />
              </TableCell>
              <TableCell class="py-1">
                <shared-select
                  v-model="row.type"
                  placeholder="Tipo"
                  :options="typeOptions"
                  :disabled="isSaving"
                  @update:model-value="onTypeChange(row, $event)"
                />
              </TableCell>
              <TableCell class="py-1">
                <shared-input
                  v-model="row.amount"
                  money-br
                  placeholder="0,00"
                  :disabled="isSaving"
                />
              </TableCell>
              <TableCell class="py-1">
                <shared-select
                  v-model="row.categoryId"
                  placeholder="Categoria"
                  :options="categoryOptionsFor(row.type)"
                  :disabled="isSaving"
                  :class="!row.categoryId ? 'opacity-70' : ''"
                />
              </TableCell>
              <TableCell class="py-1">
                <Input
                  v-model="row.description"
                  placeholder="Descrição"
                  maxlength="120"
                  :disabled="isSaving"
                />
                <p v-if="row.error" class="text-destructive mt-1 text-xs">{{ row.error }}</p>
              </TableCell>
              <TableCell class="py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  :disabled="isSaving"
                  @click="removeRow(i)"
                >
                  <Icon name="lucide:trash" class="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="outline" type="button" :disabled="isSaving" @click="emit('cancel')">
          Cancelar
        </Button>
        <Button type="button" :disabled="isSaving || totalRows === 0" @click="save">
          <Icon v-if="isSaving" name="lucide:loader-circle" class="mr-2 size-4 animate-spin" />
          Importar {{ totalRows }} transação(ões)
        </Button>
      </DialogFooter>
    </template>
  </div>
</template>
