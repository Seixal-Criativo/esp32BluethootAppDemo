# Guia para expandir o controlador de funções Bluetooth

## Arquitetura

A aplicação Android não executa código Arduino remotamente. Invoca funções compiladas no firmware do ESP32. Assim, os argumentos são validados e ações demoradas podem decorrer ao mesmo tempo que a telemetria dos sensores.

```text
Interface → BleService.invoke() → característica de comandos encriptada
                                      ↓
                             registo COMMANDS no firmware
                                      ↓
Estado da app ← respostas/telemetria ← característica de notificações
```

O `react-native-ble-plx` transporta valores em Base64. A conversão é feita em `src/ble/constants.ts`; o protocolo e o firmware utilizam mensagens ASCII legíveis.

## Interface BLE

| Item | Valor |
| --- | --- |
| Nome do dispositivo | `ESP32_LED` |
| UUID do serviço | `7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001` |
| UUID de comandos | `7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001` |
| UUID de eventos | `7B6F0003-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Segurança | Emparelhamento BLE encriptado (Just Works) |
| Tamanho máximo | 160 bytes ASCII |

```text
C|idPedido|nome.funcao|chave=valor;chave=valor
R|idPedido|ok|chave=valor
R|idPedido|error|code=CODIGO;message=descricao
E|nome.evento|chave=valor;chave=valor
```

O ID associa respostas a pedidos simultâneos. Os valores não podem conter `|`, `;` ou `=`. A aplicação considera um pedido expirado ao fim de cinco segundos.

## Funções incluídas

| Função | Argumentos | Resultado |
| --- | --- | --- |
| `system.snapshot` | nenhum | estado do LED, blink e stream |
| `led.set` | `on=0|1` | estado do LED e blink |
| `led.blink` | `onMs=50..10000`, `offMs=50..10000`, `count=1..100` | estado do LED e blink |
| `sensor.subscribe` | `intervalMs=100..5000` | estado e intervalo do stream |
| `sensor.unsubscribe` | nenhum | estado e intervalo do stream |

`led.set` cancela um blink ativo. O blink utiliza uma máquina de estados com `millis()`, sem bloquear a leitura do sensor. O firmware interrompe o stream quando o telemóvel se desliga.

## Adicionar uma função

1. Crie um handler em `firmware/Esp32LedBle/Esp32LedBle.ino`:

   ```cpp
   void relayPulse(uint32_t id, const String& arguments) {
     uint32_t durationMs;
     if (!unsignedArgument(arguments, "durationMs", 50, 5000, durationMs)) {
       errorResponse(id, "INVALID_ARGUMENT", "durationMs must be 50 to 5000");
       return;
     }

     // Inicie aqui o comportamento não bloqueante.
     response(id, "active=1");
   }
   ```

2. Registe-o em `COMMANDS`: `{"relay.pulse", relayPulse}`.
3. Acrescente argumentos e resultado a `Esp32CommandMap`, em `src/ble/types.ts`.
4. Interprete o resultado em `BleService.invoke` e crie um controlo validado na interface.
5. Compile e envie o firmware, atualize a app e teste valores válidos, inválidos, timeout e desconexão.

Os handlers devem terminar rapidamente. Motores, relés, animações e amostragem temporizada devem guardar estado e avançar em `loop()` com comparações seguras de `millis()`.

## Adicionar outro sensor em tempo real

1. Inicialize o sensor em `setup()`.
2. Crie funções de subscrição ou estenda conscientemente as existentes.
3. Leia o sensor periodicamente em `loop()` e publique um evento compacto.
4. Adicione o evento a `DeviceEvent` em `src/ble/types.ts`.
5. Valide-o em `src/ble/protocol.ts`.
6. Encaminhe-o através de `BleService.subscribe` para a interface.
7. Limite o histórico guardado para evitar crescimento contínuo da memória.

BLE é indicado para medições compactas, não para áudio ou vídeo de alta largura de banda.

## Demonstração analógica no GPIO 34

```text
ESP32 3.3 V   ── terminal exterior do potenciómetro
ESP32 GND     ── outro terminal exterior
ESP32 GPIO 34 ── terminal central/cursor
```

O GPIO 34 apenas funciona como entrada. O sinal deve permanecer entre 0 V e 3,3 V. `analogReadMilliVolts()` é aproximado e pode exigir calibração.

## Verificação

```powershell
npx tsc --noEmit
npx expo install --check
npx expo run:android
```

Envie o sketch correspondente pelo Arduino IDE. Se o emparelhamento falhar depois de atualizar o protocolo, remova `ESP32_LED` das definições Bluetooth do Android, reinicie o ESP32 e volte a emparelhar.
