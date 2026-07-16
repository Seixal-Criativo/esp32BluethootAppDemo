# Guia para expandir o controlador Bluetooth

## Visão geral

Este projeto controla hardware ligado ao ESP32 a partir de uma aplicação Android em React Native, usando Bluetooth Low Energy (BLE). Não utiliza Wi-Fi, servidor cloud nem backend.

```text
Aplicação React Native
  → encontra ESP32_LED através de uma pesquisa BLE
  → liga-se e conclui o emparelhamento Bluetooth
  → envia um comando legível, por exemplo LED:1
  → o ESP32 valida o comando
  → o ESP32 altera a saída GPIO correspondente
```

Depois de ligar ou processar um comando, o ESP32 devolve um resumo do estado, por exemplo:

```text
LED=1;RELAY=0
```

## Contrato BLE

| Elemento | Valor |
| --- | --- |
| Nome do dispositivo | `ESP32_LED` |
| UUID do serviço | `7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001` |
| UUID da característica de controlo | `7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Segurança | Característica BLE encriptada com emparelhamento Just Works |
| Ligar uma função | `ID_DA_FUNÇÃO:1` |
| Desligar uma função | `ID_DA_FUNÇÃO:0` |
| Pedir todos os estados | `GET` |
| Resposta de estado | `ID_DA_FUNÇÃO=0;OUTRO_ID=1` |

A aplicação converte os comandos para Base64 antes de os enviar, porque `react-native-ble-plx` usa Base64 nos valores das características. Só precisa de trabalhar com texto normal, como `LED:1`; a conversão é feita em `src/ble/constants.ts`.

## Ficheiros principais

| Ficheiro | Função |
| --- | --- |
| `firmware/Esp32LedBle/Esp32LedBle.ino` | Servidor BLE do ESP32, validação de comandos e saídas GPIO |
| `src/ble/functions.ts` | Registo de funções da app; os controlos são criados a partir desta lista |
| `src/ble/BleService.ts` | Pesquisa BLE, ligação, leitura de estado e envio de comandos |
| `src/ble/constants.ts` | Nome BLE, UUIDs, conversão Base64 e auxiliares do protocolo |
| `App.tsx` | Ecrã de ligação e interruptores criados automaticamente |

## Adicionar uma nova função de ligar/desligar

Para adicionar uma saída GPIO com interruptor, basta criar uma entrada correspondente no registo do ESP32 e no registo da aplicação.

### Passo 1 — Adicionar a saída no ESP32

Abra `firmware/Esp32LedBle/Esp32LedBle.ino` e procure `OUTPUTS`:

```cpp
OutputFunction OUTPUTS[] = {
  {"LED", 12, false, false},
  // {"RELAY", 13, false, false},
};
```

Adicione uma linha para a nova saída. Para um relé no GPIO 13:

```cpp
{"RELAY", 13, false, false},
```

Cada valor significa:

```text
{ "ID_DA_FUNÇÃO", PINO_GPIO, ATIVO_EM_LOW, ESTADO_INICIAL }
```

- `ID_DA_FUNÇÃO`: identificador em maiúsculas usado no BLE e na app, por exemplo `RELAY`.
- `PINO_GPIO`: pino de saída do ESP32, por exemplo `13`.
- `ATIVO_EM_LOW`: use `false` para ligações normais, em que HIGH = ligado; use `true` apenas em hardware invertido.
- `ESTADO_INICIAL`: normalmente `false`, para o dispositivo arrancar desligado em segurança.

### Passo 2 — Adicionar a função correspondente na app

Abra `src/ble/functions.ts` e adicione o mesmo ID:

```ts
export const CONTROLLER_FUNCTIONS = [
  {
    id: 'LED',
    label: 'LED no GPIO 12',
    description: 'LED externo ligado ao GPIO 12',
  },
  {
    id: 'RELAY',
    label: 'Relé',
    description: 'Módulo de relé ligado ao GPIO 13',
  },
] as const;
```

A aplicação cria automaticamente o interruptor do relé. Para uma saída normal de ligar/desligar não precisa de criar outro UUID, outro serviço BLE nem alterar o `App.tsx`.

### Passo 3 — Compilar, enviar e recarregar

1. Compile e envie o ficheiro `.ino` para o ESP32.
2. Recarregue a aplicação de desenvolvimento Expo.
3. Ligue-se ao `ESP32_LED`.
4. O novo interruptor aparece automaticamente.
5. Altere o interruptor e confirme que o hardware responde.

## Exemplo: adicionar um buzzer

Para um buzzer ativo no GPIO 14:

```cpp
// firmware/Esp32LedBle/Esp32LedBle.ino
{"BUZZER", 14, false, false},
```

```ts
// src/ble/functions.ts
{ id: 'BUZZER', label: 'Buzzer', description: 'Buzzer ativo no GPIO 14' },
```

A app envia `BUZZER:1` para ligar e `BUZZER:0` para desligar.

> Para motores, solenoides, bobinas de relés, fitas LED e outro equipamento de corrente elevada, utilize um transistor, MOSFET, módulo de relé, díodo de roda livre e fonte de alimentação separados quando necessário. Nunca alimente estas cargas diretamente a partir de um GPIO do ESP32.

## Adicionar funções mais avançadas

O registo foi feito para saídas binárias simples. Para funcionalidades mais avançadas, use a mesma característica de controlo, mas adicione um tratamento próprio no ESP32:

| Funcionalidade | Exemplo de comando | Controlo na app |
| --- | --- | --- |
| Brilho PWM | `BRIGHTNESS:128` | Slider |
| Ângulo de servo | `SERVO:90` | Slider ou botões predefinidos |
| Buzzer temporizado | `BEEP:500` | Botão |
| Estado de sensor | `TEMPERATURE=23.4` | Valor de texto ou gráfico |

Nestes casos, valide o valor numérico e os limites permitidos no sketch do ESP32 antes de controlar o hardware. Adicione o controlo correspondente em `App.tsx` e, se necessário, um método de escrita tipado em `BleService.ts`.

## Regras de segurança e manutenção

- Os IDs das funções têm de ser exatamente iguais em `OUTPUTS` e `CONTROLLER_FUNCTIONS`.
- Use IDs em maiúsculas, apenas com letras, números e underscores.
- Inicie novas saídas físicas desligadas, salvo se existir uma razão clara para o contrário.
- Valide todos os dados BLE recebidos no ESP32 antes de alterar o estado de um GPIO.
- Não reutilize um pino de arranque (*boot-strapping*) do ESP32 sem confirmar o respetivo comportamento durante o arranque.
- Alterações apenas em JavaScript exigem recarregar o Expo; alterações de configuração ou dependências nativas exigem uma nova build Android.
- Qualquer alteração ao `.ino` exige compilação e envio de firmware para o ESP32.

## Resolução de problemas

| Problema | Solução |
| --- | --- |
| O novo interruptor não aparece | Confirme que a entrada foi adicionada a `CONTROLLER_FUNCTIONS` e recarregue a app. |
| O interruptor aparece mas não faz nada | Confirme que existe o mesmo ID em `OUTPUTS`, compile e envie o sketch para o ESP32. |
| O ESP32 rejeita um comando | Abra o Monitor Série a 115200 baud; o firmware escreve comandos inválidos ou desconhecidos. |
| A app não consegue voltar a ligar | Remova `ESP32_LED` nas definições Bluetooth Android, reinicie o ESP32 e faça nova pesquisa. |
| Não é possível enviar o firmware | Feche o Monitor Série ou qualquer aplicação que esteja a utilizar a porta COM do ESP32 e tente novamente. |
